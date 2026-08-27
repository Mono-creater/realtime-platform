// ============================================================
// 受电弓控制引擎：双环 PID（接触力环 + 姿态环）+ Z-N 阶跃整定
//
// 公式出处（详见 docs/PLC接入操作手册.md 附录）：
// 1. 位置式并联 PID，微分先行（对测量微分），条件积分抗饱和：
//      u = Kp·e + Ki·∫e·dt − Kd·dy/dt
//    —— Åström & Hägglund, PID Controllers: Theory, Design and
//       Tuning, 2nd ed., ISA, 1995（§3 抗饱和 / §5 微分先行）
// 2. Ziegler-Nichols 开环阶跃整定（FOPDT 拟合）：
//      施加 Δu 阶跃 → 拟合 K·e^(−Ls)/(Ts+1)（K=Δy/Δu，T=63.2% 法，L=拐点切线法）
//      → Kp = 1.2·T/(K·L)，Ti = 2L，Td = 0.5L（Ki=Kp/Ti，Kd=Kp·Td）
//    —— Ziegler & Nichols, Trans. ASME 64:759-768, 1942
// 3. 接触力-气囊力平衡（EN 50367:2012 静态接触力 70~120N，默认目标 100N）：
//      F = p_air × A_eff − F_offset   （A_eff、F_offset 需现场实测标定）
// 4. 两连杆正运动学（剪式机构近似 θ2 = r·θ1）：
//      H = L1·sinθ1 + L2·sin(r·θ1)，反解 θ1 用二分法（0~88°）
//    —— Craig, Introduction to Robotics（标准平面二连杆）
//
// 环境变量（PANTO_*）可在 .env 覆盖，见 .env.example。
// ============================================================

const envNum = (name, def) => {
    const v = process.env[name];
    if (v === undefined || v === '' || Number.isNaN(Number(v))) return def;
    return Number(v);
};

const DEFAULTS = {
    // 接触力模型（实测标定）
    aEff: envNum('PANTO_A_EFF', 0.001),        // m²  气囊有效面积
    fOffset: envNum('PANTO_F_OFFSET', 0),      // N   弹簧/重力补偿偏置
    fTarget: envNum('PANTO_F_TARGET', 100),    // N   接触力目标（EN 50367: 70~120N）
    // 运动学模型（实测标定）
    l1: envNum('PANTO_L1', 1200),              // mm  下臂杆长
    l2: envNum('PANTO_L2', 1300),              // mm  上臂杆长
    thetaRatio: envNum('PANTO_THETA_RATIO', 0.8), // θ2 = r·θ1
    hTarget: envNum('PANTO_H_TARGET', 2400),   // mm  弓头高度目标
    // 植物模型（一阶滞后 + 纯滞后，与 plc-simulator.js 一致）
    tauForce: envNum('PANTO_TAU_FORCE', 2.0),  // s
    tauHeight: envNum('PANTO_TAU_HEIGHT', 0.5),// s
    deadTimeMs: envNum('PANTO_DEADTIME_MS', 600), // ms 比例阀+管路纯滞后（ZN 要求 L>0）
    // 输出钳位
    forceOutMin: 50, forceOutMax: 1000,        // kPa
    heightOutMin: 1000, heightOutMax: 2600,    // mm
    // 初值（自动调节未启动时的输出）
    u0Force: 250,                              // kPa
    u0Height: 1800,                            // mm
    // 整定
    controlInterval: envNum('CONTROL_INTERVAL', 500), // ms
    znStepPct: envNum('ZN_STEP_PCT', 10),      // % 量程
    znSettleMaxS: envNum('ZN_SETTLE_MAX_S', 60),      // s 阶跃最大等待
    // 测试注入时钟
    clock: () => Date.now()
};

// ---------- 纯函数（可独立测试） ----------

/** 接触力-气囊力平衡（EN 50367:2012）：F = p·A_eff − F_offset */
function contactForce(pressureKPa, aEff, fOffset) {
    return pressureKPa * 1000 * aEff - fOffset;
}

/** 两连杆正运动学（Craig）：H = L1·sinθ1 + L2·sin(r·θ1)，θ1 单位度 */
function pantographHeight(theta1Deg, L1, L2, r) {
    const a = (theta1Deg * Math.PI) / 180;
    return L1 * Math.sin(a) + L2 * Math.sin(r * a);
}

/** 反解 θ1：二分法 0~88°，返回 {theta1, theta2, saturated} */
function pantographTheta1(targetH, L1, L2, r) {
    const f = (deg) => pantographHeight(deg, L1, L2, r) - targetH;
    if (f(88) < 0) return { theta1: 88, theta2: 88 * r, saturated: true }; // 超出机构行程
    if (targetH <= 0) return { theta1: 0, theta2: 0, saturated: true };    // 低于最小高度
    let lo = 0, hi = 88;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid; else hi = mid; // f 单调增：f<0 根在右
    }
    const t1 = (lo + hi) / 2;
    return { theta1: t1, theta2: t1 * r, saturated: false };
}

/** Z-N 整定公式（Ziegler & Nichols 1942） */
function znGains(K, T, L) {
    const kp = (1.2 * T) / (K * L);
    const ti = 2 * L;
    const td = 0.5 * L;
    return { kp, ti, td, ki: kp / ti, kd: kp * td };
}

// ---------- 引擎 ----------

function createControlEngine(options) {
    const cfg = { ...DEFAULTS, ...(options || {}) };
    const dtDefault = cfg.controlInterval / 1000;

    function makeLoop(kind) {
        const isForce = kind === 'force';
        return {
            kind,
            target: isForce ? cfg.fTarget : cfg.hTarget,
            min: isForce ? cfg.forceOutMin : cfg.heightOutMin,
            max: isForce ? cfg.forceOutMax : cfg.heightOutMax,
            unit: isForce ? 'kPa' : 'mm',
            // 默认保守（阻尼型）参数：出厂投运先求稳，现场经 Z-N 整定优化。
            // 注：姿态环纯滞后占比大（L≈T），Z-N 理论增益易振荡，保守值更稳。
            kp: isForce ? 1.5 : 0.3,
            ki: isForce ? 0.5 : 0.12,
            kd: isForce ? 0.5 : 0.05,
            integral: 0,
            lastMeas: null,
            lastTime: null,
            output: isForce ? cfg.u0Force : cfg.u0Height,
            auto: false,
            saturated: false,
            error: 0,
            measurement: isForce ? contactForce(cfg.u0Force, cfg.aEff, cfg.fOffset) : cfg.u0Height
        };
    }

    const loops = { force: makeLoop('force'), posture: makeLoop('posture') };

    // 内部植物模型（模拟模式测量来源 + 姿态环测量来源；带纯滞后）
    let pPlant = cfg.u0Force;
    let hPlant = cfg.u0Height;
    const uHistory = [{ t: cfg.clock() - cfg.deadTimeMs, force: cfg.u0Force, height: cfg.u0Height }];
    let lastSensor = { pressure: cfg.u0Force };
    let lastMode = 'simulation';

    // 阶跃整定状态机：idle → sampling → fitting → done/failed/cancelled
    let tune = null;

    function currentInput(kind, now) {
        // 只应用 ≥ deadTimeMs 前的输出（纯滞后）
        let eff = null;
        for (const h of uHistory) {
            if (now - h.t >= cfg.deadTimeMs) eff = h;
            else break;
        }
        return eff ? eff[kind] : (kind === 'force' ? cfg.u0Force : cfg.u0Height);
    }

    function stepLoop(loop, meas, now) {
        const dt = loop.lastTime
            ? Math.min(Math.max((now - loop.lastTime) / 1000, 0.01), 5)
            : dtDefault;
        const err = loop.target - meas;
        const dMeas = loop.lastMeas !== null ? meas - loop.lastMeas : 0;
        const pTerm = loop.kp * err;
        const dTerm = -(loop.kd * dMeas) / dt; // 微分先行：对测量微分
        const rawIntegral = loop.integral + loop.ki * err * dt;

        let u = pTerm + rawIntegral + dTerm;
        let clamped = false;
        if (u > loop.max) { u = loop.max; clamped = true; }
        else if (u < loop.min) { u = loop.min; clamped = true; }
        // 条件积分抗饱和：输出饱和且误差继续朝饱和方向时才冻结积分
        const pushing = (u === loop.max && err > 0) || (u === loop.min && err < 0);
        loop.integral = clamped && pushing ? loop.integral : rawIntegral;

        loop.output = u;
        loop.saturated = clamped;
        loop.error = err;
        loop.measurement = meas;
        loop.lastMeas = meas;
        loop.lastTime = now;
    }

    function tuneSample(now, meas) {
        const t = (now - tune.startedAt) / 1000;
        tune.samples.push({ t, y: meas });
        tune.elapsedS = t;
        // y0 已在 startTune 记录（阶跃前测量值，标准 ZN 流程）

        const n = tune.samples.length;
        // 收敛判定：最近 6 点（约 3s）峰峰值 < 当前响应幅度的 2%
        //（相对判据，避免响应缓升期误判收敛）
        if (n >= 6 && t >= 5) {
            const recent = tune.samples.slice(-6).map((s) => s.y);
            const span = Math.max(...recent) - Math.min(...recent);
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            const amplitude = Math.abs(mean - tune.y0);
            if (amplitude > 1e-6 && span < 0.02 * amplitude) { finishFit(now); return; }
        }
        if (t >= cfg.znSettleMaxS) {
            finishFit(now, '阶跃响应等待超时（60s），按已有数据拟合');
        }
    }

    function finishFit(now, warn) {
        const s = tune.samples;
        if (s.length < 8) {
            tuneFail('采样点不足，无法拟合');
            return;
        }
        // 直接拟合原始采样（阶跃边沿不宜平滑，会低估 L；
        // 实际噪声由 PLC 侧 10 条滑窗均值滤除）
        const ys = s.map((p) => p.y);

        const y0 = ys[0];
        const yInf = (ys[ys.length - 3] + ys[ys.length - 2] + ys[ys.length - 1]) / 3;
        const dY = yInf - y0;
        const dU = tune.stepDelta;
        if (Math.abs(dY) < 1e-6) { tuneFail('响应无变化，检查执行机构或增大阶跃幅值'); return; }

        const K = dY / dU;
        // 响应起点检测（连续 2 点偏离基线超 8%Δy，抗噪声）：
        // 仅用于校验与回退；L/T 主估计用尾部回归。
        const noise = 0.08 * Math.abs(dY);
        let tFirst = null;
        for (let i = 1; i < s.length; i++) {
            if (Math.abs(ys[i] - y0) > noise && Math.abs(ys[i - 1] - y0) > noise) {
                tFirst = s[i - 1].t;
                break;
            }
        }
        if (tFirst === null) { tuneFail('响应未偏离基线，检查执行机构或增大阶跃幅值'); return; }

        // 尾部两点回归法（Åström & Hägglund §2.7 离散 FOPDT 拟合）：
        // f(t) = (y∞−y)/Δy = e^(−(t−L)/T) → ln f = L/T − t/T，最小二乘求 T、L。
        const tail = [];
        for (let i = 0; i < s.length; i++) {
            const f = (yInf - ys[i]) / dY;
            if (f >= 0.2 && f <= 0.8) tail.push({ x: s[i].t, y: Math.log(f) });
        }
        let L, T;
        if (process.env.ZN_DEBUG) {
            console.log('[ZN_DEBUG] y0=' + y0.toFixed(1) + ' yInf=' + yInf.toFixed(1) + ' dY=' + dY.toFixed(1)
                + ' nSamples=' + s.length + ' tailPoints=' + tail.length);
            for (const p of tail) console.log('[ZN_DEBUG]   t=' + p.x.toFixed(2) + ' lnf=' + p.y.toFixed(4));
        }
        if (tail.length >= 4) {
            const n = tail.length;
            const sx = tail.reduce((a, p) => a + p.x, 0);
            const sy = tail.reduce((a, p) => a + p.y, 0);
            const sxx = tail.reduce((a, p) => a + p.x * p.x, 0);
            const sxy = tail.reduce((a, p) => a + p.x * p.y, 0);
            const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
            if (!(slope < 0)) { tuneFail('尾部回归斜率异常，无法拟合'); return; }
            T = -1 / slope;
            L = ((sy - slope * sx) / n) * T; // 截距×T
        } else {
            // 回退：63.2% 法求 T，L 取响应起点
            const y632 = y0 + 0.632 * dY;
            let t632 = null;
            for (let i = 0; i < s.length; i++) {
                if (ys[i] >= y632) { t632 = s[i].t; break; }
            }
            if (t632 === null) { tuneFail('响应未达 63.2%，请增大阶跃幅值或延长等待'); return; }
            L = tFirst;
            T = t632 - L;
        }
        L = Math.max(0.05, L);
        if (!(L > 0.05) || !(T > 0.05) || !(K > 0)) {
            tuneFail(`拟合参数非法（K=${K.toFixed(3)}, T=${T.toFixed(2)}s, L=${L.toFixed(2)}s）`);
            return;
        }
        if (T <= L) { tuneFail(`纯滞后占比过大（T=${T.toFixed(2)}s ≤ L=${L.toFixed(2)}s），Z-N 不适用`); return; }

        const g = znGains(K, T, L);
        const loop = loops[tune.loopKind];
        loop.kp = g.kp; loop.ki = g.ki; loop.kd = g.kd;
        loop.output = tune.uBaseline; // 撤除阶跃，回到基线
        loop.integral = 0; loop.lastMeas = null; loop.lastTime = null;
        tune.state = 'done';
        tune.result = { K, T, L, dY, dU, ...g };
        tune.warn = warn || null;
        tune.elapsedS = (now - tune.startedAt) / 1000;
        loop.auto = tune.wasAuto; // 恢复到整定前的自动状态（与 tuneFail 一致）
    }

    function tuneFail(reason) {
        const loop = loops[tune.loopKind];
        loop.output = tune.uBaseline;
        loop.auto = tune.wasAuto;
        loop.integral = 0; loop.lastMeas = null; loop.lastTime = null;
        tune.state = 'failed';
        tune.error = reason;
    }

    // ---------- 公开接口 ----------

    /**
     * 控制节拍（server.js 每 CONTROL_INTERVAL 调用）
     * @param {{pressure:number}|null} sensor 最新传感器读数（plc 模式用其压力）
     * @param {'plc'|'simulation'} mode 数据源模式
     */
    function tick(sensor, mode) {
        const now = cfg.clock();
        if (sensor && sensor.pressure != null) lastSensor = sensor;
        if (mode) lastMode = mode;

        // 1. 内部植物模型推进（含纯滞后）
        const dt = Math.min(Math.max(cfg.controlInterval / 1000, 0.01), 5);
        const uEff = {
            force: currentInput('force', now),
            height: currentInput('height', now)
        };
        pPlant += ((uEff.force - pPlant) * dt) / cfg.tauForce;
        hPlant += ((uEff.height - hPlant) * dt) / cfg.tauHeight;
        hPlant = Math.min(cfg.heightOutMax, Math.max(cfg.heightOutMin, hPlant));
        uHistory.push({ t: now, force: loops.force.output, height: loops.posture.output });
        while (uHistory.length > 40) uHistory.shift();

        // 2. 测量
        const pMeas = lastMode === 'plc' ? (lastSensor.pressure ?? pPlant) : pPlant;
        const fMeas = contactForce(pMeas, cfg.aEff, cfg.fOffset);
        const hMeas = hPlant;

        // 3. 双环 PID（整定中的环被阶跃输出接管，不执行 PID）
        const forceTuning = tune && tune.loopKind === 'force' && tune.state === 'sampling';
        const postureTuning = tune && tune.loopKind === 'posture' && tune.state === 'sampling';

        if (forceTuning) {
            loops.force.output = tune.uBaseline + tune.stepDelta;
            // 整定期间同步测量显示（否则 UI 冻结在阶跃前值）
            loops.force.error = loops.force.target - fMeas;
            loops.force.measurement = fMeas;
            loops.force.lastMeas = fMeas;
            loops.force.lastTime = now;
            tuneSample(now, fMeas);
        } else if (loops.force.auto) {
            stepLoop(loops.force, fMeas, now);
        } else {
            loops.force.error = loops.force.target - fMeas;
            loops.force.measurement = fMeas;
            loops.force.lastMeas = fMeas;
            loops.force.lastTime = now;
        }

        if (postureTuning) {
            loops.posture.output = tune.uBaseline + tune.stepDelta;
            loops.posture.error = loops.posture.target - hMeas;
            loops.posture.measurement = hMeas;
            loops.posture.lastMeas = hMeas;
            loops.posture.lastTime = now;
            tuneSample(now, hMeas);
        } else if (loops.posture.auto) {
            stepLoop(loops.posture, hMeas, now);
        } else {
            loops.posture.error = loops.posture.target - hMeas;
            loops.posture.measurement = hMeas;
            loops.posture.lastMeas = hMeas;
            loops.posture.lastTime = now;
        }
    }

    function loopStatus(loop) {
        return {
            target: loop.target,
            measurement: Math.round(loop.measurement * 100) / 100,
            error: Math.round(loop.error * 100) / 100,
            output: Math.round(loop.output * 100) / 100,
            unit: loop.unit,
            kp: loop.kp, ki: loop.ki, kd: loop.kd,
            auto: loop.auto,
            saturated: loop.saturated,
            min: loop.min, max: loop.max
        };
    }

    function getStatus() {
        const kin = pantographTheta1(hPlant, cfg.l1, cfg.l2, cfg.thetaRatio);
        return {
            mode: lastMode,
            loops: { force: loopStatus(loops.force), posture: loopStatus(loops.posture) },
            computed: {
                contactForce: Math.round(contactForce(lastSensor.pressure ?? pPlant, cfg.aEff, cfg.fOffset) * 100) / 100,
                airPressure: Math.round((lastSensor.pressure ?? pPlant) * 100) / 100,
                height: Math.round(hPlant * 10) / 10,
                theta1: Math.round(kin.theta1 * 100) / 100,
                theta2: Math.round(kin.theta2 * 100) / 100,
                kinematicSaturated: kin.saturated
            },
            tune: tune ? {
                loop: tune.loopKind,
                state: tune.state,
                elapsedS: Math.round((tune.elapsedS || 0) * 10) / 10,
                progressPct: Math.min(100, Math.round(((tune.elapsedS || 0) / cfg.znSettleMaxS) * 100)),
                stepDelta: tune.stepDelta,
                result: tune.result || null,
                error: tune.error || null,
                warn: tune.warn || null
            } : null
        };
    }

    /** 手动改参（整定中该环不可改） */
    function setParams(loopKind, params) {
        if (!loops[loopKind]) return { ok: false, error: `未知回路: ${loopKind}` };
        if (tune && tune.loopKind === loopKind && tune.state === 'sampling') {
            return { ok: false, error: '该回路正在 Z-N 整定中，不可修改参数' };
        }
        const loop = loops[loopKind];
        for (const key of ['kp', 'ki', 'kd', 'target']) {
            if (params[key] !== undefined) {
                const v = Number(params[key]);
                if (!Number.isFinite(v) || v < 0) return { ok: false, error: `${key} 必须是非负数字` };
                if (key === 'target') {
                    // 目标必须落在该回路可实现的测量范围内
                    const measRange = loopKind === 'force'
                        ? [contactForce(loop.min, cfg.aEff, cfg.fOffset), contactForce(loop.max, cfg.aEff, cfg.fOffset)]
                        : [loop.min, loop.max];
                    if (v < measRange[0] || v > measRange[1]) {
                        return { ok: false, error: `target 超出可实现范围 [${measRange[0].toFixed(1)}, ${measRange[1].toFixed(1)}]${loopKind === 'force' ? 'N' : 'mm'}` };
                    }
                }
                loop[key] = v;
            }
        }
        return { ok: true };
    }

    /** 自动调节开关（启用时无扰切换：积分预载当前输出） */
    function setAuto(loopKind, enabled) {
        if (!loops[loopKind]) return { ok: false, error: `未知回路: ${loopKind}` };
        if (enabled && tune && tune.loopKind === loopKind && tune.state === 'sampling') {
            return { ok: false, error: '该回路正在 Z-N 整定中，请先取消' };
        }
        const loop = loops[loopKind];
        loop.auto = !!enabled;
        if (enabled) {
            loop.lastMeas = null;
            loop.lastTime = null;
            // 无扰切换（Åström & Hägglund §3.5）：以当前输出预载积分。
            // 大初始误差时不预载（预载量过大会在误差过零后反向 windup），
            // 以积分 0 启动，允许输出阶跃（投运动作，方向正确即可）。
            const measRange = loopKind === 'force'
                ? (loop.max - loop.min) * 1000 * cfg.aEff
                : (loop.max - loop.min);
            loop.integral = Math.abs(loop.error) <= 0.2 * measRange
                ? Math.max(0, loop.output - loop.kp * loop.error)
                : 0;
        }
        return { ok: true };
    }

    /** 开始 Z-N 阶跃整定（一次一个回路） */
    function startTune(loopKind) {
        if (!loops[loopKind]) return { ok: false, error: `未知回路: ${loopKind}` };
        if (tune && tune.state === 'sampling') return { ok: false, error: `已有回路正在整定中，请先取消` };
        const loop = loops[loopKind];
        const dU = (cfg.znStepPct / 100) * (loop.max - loop.min);
        tune = {
            loopKind,
            state: 'sampling',
            startedAt: cfg.clock(),
            elapsedS: 0,
            uBaseline: loop.output,
            stepDelta: dU,
            y0: loop.measurement, // 阶跃前测量值（标准 ZN 流程基线）
            samples: [],
            wasAuto: loop.auto,
            saved: { kp: loop.kp, ki: loop.ki, kd: loop.kd },
            result: null, error: null, warn: null
        };
        loop.auto = false;
        loop.integral = 0;
        loop.output = loop.output + dU; // 立即施加阶跃
        return { ok: true, stepDelta: dU };
    }

    function cancelTune() {
        if (!tune || tune.state !== 'sampling') return { ok: false, error: '当前无整定任务' };
        const loop = loops[tune.loopKind];
        loop.output = tune.uBaseline;
        loop.kp = tune.saved.kp; loop.ki = tune.saved.ki; loop.kd = tune.saved.kd;
        loop.auto = tune.wasAuto;
        loop.integral = 0; loop.lastMeas = null; loop.lastTime = null;
        tune.state = 'cancelled';
        return { ok: true };
    }

    return {
        tick, getStatus, setParams, setAuto, startTune, cancelTune,
        config: cfg
    };
}

module.exports = {
    createControlEngine,
    contactForce,
    pantographHeight,
    pantographTheta1,
    znGains
};
