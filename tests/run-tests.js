/**
 * tests/run-tests.js —— 升级效果检验（无第三方依赖，node tests/run-tests.js 直接运行）
 *
 * 覆盖：标准公式、控制器 v1/v2 对比（含 IMC 补全）、告警时延与误报抑制、
 *       链路质量与写回读校验、运维工单与健康分级。
 * 输出：控制台 PASS/FAIL + tests/report.json 指标汇总。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const std = require('../standards');
const ctl = require('../control-engine-v2');
const { AlarmEngine } = require('../alarm-engine');
const { LinkMonitor } = require('../link-monitor');
const { MaintenanceService } = require('../maintenance');

let pass = 0, fail = 0;
const lines = [];
const report = { sections: {} };
function ok(cond, name, extra) {
    if (cond) { pass++; lines.push(`PASS  ${name}${extra ? '  ' + extra : ''}`); }
    else { fail++; lines.push(`FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}
function near(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name, `(${a} ≈ ${b} ±${tol})`); }
function section(t) { lines.push(''); lines.push('== ' + t + ' =='); }

/* ---------------- A. 标准与公式 ---------------- */
section('A 标准与指标公式');
const f0 = std.targetMeanContactForce(0), f80 = std.targetMeanContactForce(80),
      f160 = std.targetMeanContactForce(160), f250 = std.targetMeanContactForce(250),
      fd80 = std.targetMeanContactForce(80, { system: 'DC' });
near(f0.value, 70, 0.01, '交流 v=0 时 Fm=70 N');
near(f80.value, 0.00097 * 6400 + 70, 0.01, '交流 v=80 km/h 的目标接触力符合 Fm=0.00097v²+70');
near(f160.value, 0.00097 * 25600 + 70, 0.01, '交流 v=160 km/h 目标接触力');
near(fd80.value, 0.00155 * 6400 + 70, 0.01, '直流 v=80 km/h 目标接触力（系数 0.00155）');
ok(f250.value <= 250, '目标值受上限截断（≤250 N）', `Fm(250)=${f250.value.toFixed(1)} N`);
const lim = std.dynamicLimits(f160.value);
near(lim.sigmaMax, 0.3 * f160.value, 0.01, '标准差限值 σ≤0.3Fm');
near(lim.fMax, f160.value + 3 * lim.sigmaMax, 0.01, '上限 Fmax=Fm+3σ');
const eGood = std.evaluateContactForce({ v: 80, mean: f80.value, std: 0.1 * f80.value });
const eBad = std.evaluateContactForce({ v: 80, mean: f80.value * 2, std: 0.5 * f80.value });
ok(eGood.ok === true, '接触力一致性：正常样本通过');
ok(eBad.ok === false && eBad.violations.length === 2, '接触力一致性：越限样本报出 2 项违规', eBad.violations.join('；'));
report.sections.standards = { Fm_0: f0.value, Fm_80: f80.value, Fm_160: +f160.value.toFixed(2), Fm_250: f250.value, DC_80: +fd80.value.toFixed(2), limits: lim };

/* ---------------- B. 控制器 v1 / v2 对比 ---------------- */
section('B 双环 PID 控制升级（接触力环：升阶跃 70→100 N）');
const plant = { gain: 0.9923, K: 0.9923, T: 1.7046, L: 1.0078, tau: 1.7046, dt: 0.5, target: 100, y0: 70, u0: 70, ticks: 200, uMin: 50, uMax: 1000 };
const zn = ctl.znGains(plant.K, plant.T, plant.L);
const safe = ctl.tuneSafe(plant.K, plant.T, plant.L);
const conservative = { kp: 1.5, ki: 0.5, kd: 0.5 };              // 项目出厂默认（保守）
const P = ctl.PRESETS.contactForce;
const rCons = ctl.simulateClosedLoop(Object.assign({}, plant, { gains: conservative, derivFilterN: 0, integralSeparation: 1e9, rampRate: 0 }));
const rZN = ctl.simulateClosedLoop(Object.assign({}, plant, { gains: zn, derivFilterN: 0, integralSeparation: 1e9, rampRate: 0 }));
const rV2 = ctl.simulateClosedLoop(Object.assign({}, plant, { gains: safe, derivFilterN: P.derivFilterN, integralSeparation: P.integralSeparation, rampRate: P.rampRate }));
ok(rZN.metrics.overshootPct > 50, 'v1 直接套用 Z-N 超调过大（暴露整定风险）', `overshoot=${rZN.metrics.overshootPct}%`);
ok(rV2.metrics.overshootPct <= 5, 'v2 安全预设超调 ≤5%', `overshoot=${rV2.metrics.overshootPct}%（Z-N ${rZN.metrics.overshootPct}%，出厂保守 ${rCons.metrics.overshootPct}%）`);
ok(rV2.metrics.settleS <= 20 && Math.abs(rV2.metrics.sse) <= 0.5, 'v2 在 20 s 内稳定且稳态偏差 ≤0.5 N',
   `settle=${rV2.metrics.settleS} s, sse=${rV2.metrics.sse} N`);
ok(rV2.metrics.overshootPct < rCons.metrics.overshootPct, 'v2 超调优于出厂保守参数（同为无扰投入）',
   `${rCons.metrics.overshootPct}% → ${rV2.metrics.overshootPct}%`);
ok(safe.ok && safe.method === 'ZN-折减', '安全整定策略：T>L 时按纯滞后占比折减 Z-N 增益', safe.reason);
report.sections.controlForce = { zn, safe: { reduce: safe.reduce, kp: safe.kp, ki: safe.ki, kd: safe.kd, method: safe.method },
    preset: P, conservative: rCons.metrics, znBase: rZN.metrics, v2Safe: rV2.metrics };

section('B2 姿态环：Z-N 不适用 → IMC 补全');
const pos = { gain: 1.0, K: 1.0, T: 0.5, L: 0.6, tau: 0.5, dt: 0.5, target: 2400, y0: 1800, u0: 1800, ticks: 200, uMin: 1000, uMax: 2600 };
const safeP = ctl.tuneSafe(pos.K, pos.T, pos.L);
const PP = ctl.PRESETS.posture;
ok(pos.T <= pos.L, '姿态通道 T≤L：Z-N 开环整定在原理上不适用', `T=${pos.T} s, L=${pos.L} s`);
ok(safeP.method === 'IMC', '安全整定策略自动切换为 IMC-PI', safeP.reason);
const rImcP = ctl.simulateClosedLoop(Object.assign({}, pos, { gains: safeP, derivFilterN: PP.derivFilterN, integralSeparation: PP.integralSeparation, rampRate: PP.rampRate }));
ok(rImcP.metrics.overshootPct <= 5, 'IMC 预设下姿态环超调 ≤5%', `overshoot=${rImcP.metrics.overshootPct}%`);
ok(rImcP.metrics.settleS <= 30 && Math.abs(rImcP.metrics.sse) <= 2, 'IMC 预设下姿态环 30 s 内稳定且偏差 ≤2 mm',
   `settle=${rImcP.metrics.settleS} s, sse=${rImcP.metrics.sse} mm`);
report.sections.controlPosture = { safe: safeP, preset: PP, imcMetrics: rImcP.metrics };

/* ---------------- C. 告警：误报抑制与缓变早发现 ---------------- */
section('C 告警引擎：抑制误报 + 缓变早发现');
// C1 单点尖峰：legacy 会误报，v2 不误报
const legacyCfg = { medianOnly: false, avgWindow: 1, confirmN: 1, suppressMs: 0, thresholds: Object.assign({}, std.ALARM_DEFAULTS, { temperature: Object.assign({}, std.ALARM_DEFAULTS.temperature, { rocPerMin: null }) }) };
const legacy = new AlarmEngine(legacyCfg);
const eng = new AlarmEngine({ confirmN: 2, medianOnly: true, suppressMs: 0 });
let legacyAlarms = 0, v2Alarms = 0;
for (let i = 0; i < 10; i++) {
    const t = i * 1000;
    const spike = i === 5 ? 95 : 25;
    legacyAlarms += legacy.push({ t, temperature: spike }).length;
    v2Alarms += eng.push({ t, temperature: spike }).length;
}
ok(legacyAlarms === 1, 'legacy（无滤波）对单点尖峰产生 1 次误报', `alarms=${legacyAlarms}`);
ok(v2Alarms === 0, 'v2（中值滤波＋连续确认）抑制单点尖峰误报', `alarms=${v2Alarms}`);

// C2 阶跃：时延代价对比
function stepCase(engine, onset, value, ticks) {
    let lat = null;
    for (let i = 0; i < ticks; i++) {
        const t = i * 1000;
        const v = t >= onset ? value : 25;
        const a = engine.push({ t, temperature: v, truthOnsetMs: onset });
        if (a.length && lat === null) lat = a[0].latencyMs;
    }
    return lat;
}
const latLegacy = stepCase(new AlarmEngine(legacyCfg), 60000, 85, 200);
const latV2 = stepCase(new AlarmEngine({ confirmN: 2, medianOnly: true }), 60000, 85, 200);
ok(latLegacy !== null && latV2 !== null && latV2 - latLegacy <= 2000, '阶跃告警时延代价不超过 2 s', `legacy=${latLegacy} ms, v2=${latV2} ms`);

// C3 缓变（3 ℃/min）：v2 由变化率判据提前发现
function rampCase(engine, ticks) {
    let lat = null;
    for (let i = 0; i < ticks; i++) {
        const t = i * 1000;
        const v = 60 + 0.05 * i;              // 0.05 ℃/s = 3 ℃/min
        const a = engine.push({ t, temperature: v, truthOnsetMs: 0 });
        if (a.length && lat === null) lat = a[0].latencyMs;
    }
    return lat;
}
const rampLegacy = rampCase(new AlarmEngine(legacyCfg), 900);
const rampV2 = rampCase(new AlarmEngine({ confirmN: 2, medianOnly: true }), 900);
ok(rampV2 !== null && rampLegacy !== null && rampV2 < rampLegacy * 0.5,
   'v2 对 3 ℃/min 缓变的发现时延显著短于阈值判据', `legacy=${rampLegacy / 1000} s → v2=${(rampV2 / 1000).toFixed(0)} s`);
report.sections.alarm = {
    spikeFalseAlarm: { legacy: legacyAlarms, v2: v2Alarms },
    stepLatencyMs: { legacy: latLegacy, v2: latV2 },
    rampLatencyMs: { legacy: rampLegacy, v2: rampV2 },
};

/* ---------------- D. 链路质量与写回读校验 ---------------- */
section('D 链路质量与写回读校验');
const lm = new LinkMonitor({ staleMs: 3000, badMs: 10000 });
let seq = 100;
for (let i = 0; i < 100; i++) {
    seq = (seq + 1) % 65536;
    if (i === 20 || i === 40 || i === 61) seq = (seq + 1) % 65536;   // 制造 3 处缺口
    lm.onPacket({ t: i * 1000, seq });
}
const ls = lm.stats(99000);
ok(ls.gaps === 3, '序号缺口统计正确（3 处）', `gaps=${ls.gaps}`);
near(ls.lossRate, 3 / 103, 0.01, '丢包率与缺口/应到包数一致');
ok(lm.quality(100000) === 'GOOD', '新鲜数据质量码 GOOD');
ok(lm.quality(103500) === 'STALE', '超 stale 阈值质量码 STALE');
ok(lm.quality(112000) === 'BAD', '超 bad 阈值质量码 BAD');
lm.onError(); const d1 = lm.nextRetryDelay(); lm.onError(); const d2 = lm.nextRetryDelay(); lm.onError(); const d3 = lm.nextRetryDelay();
ok(d1 < d2 && d2 < d3 && d3 <= 8000 * 1.1, '重连退避递增且有上限', `${d1}, ${d2}, ${d3} ms`);
(async () => {
    const wOk = await lm.writeVerify({ write: async () => {}, read: async () => 100, reg: 30021, value: 100 });
    ok(wOk.ok === true && wOk.attempts === 1, '写回读校验：一致时通过');
    const wBad = await lm.writeVerify({ write: async () => {}, read: async () => 50, reg: 30022, value: 2400, retries: 2 });
    ok(wBad.ok === false && wBad.attempts === 3, '写回读校验：不一致时重试并判失败', wBad.error);
    report.sections.link = { stats: ls, backoff: [d1, d2, d3], writeVerify: { ok: wOk, bad: { ok: wBad.ok, attempts: wBad.attempts } } };

    /* ---------------- E. 运维闭环 ---------------- */
    section('E 工单闭环、健康分级与 KPI');
    const ms = new MaintenanceService();
    const o = ms.create({ deviceId: 'PANTO-01', level: 'major', description: '接触力偏高', at: 0 });
    ok(ms.start(o.id, 'w1', 1000).ok === false, '状态机：未指派不能直接开工');
    ok(ms.assign(o.id, 'w1', 1000).ok && ms.start(o.id, 'w1', 2000).ok && ms.complete(o.id, 'w1', 62000, '复紧气路').ok && ms.verify(o.id, 'w2', 122000, '复核通过').ok, '工单走完 指派→开工→完成→复核');
    ok(ms.auditTrail(o.id).length === 5, '审计轨迹完整（创建＋4 次流转）', `entries=${ms.auditTrail(o.id).length}`);
    near(ms.mttr(), 1.0, 0.05, 'MTTR 计算正确（1 min）');
    const h1 = ms.healthIndex({ forceMean: 100, forceTarget: 100, forceStd: 2, tempMax: 60, alarmCount24h: 0 });
    const h2 = ms.healthIndex({ forceMean: 130, forceTarget: 100, forceStd: 20, tempMax: 88, alarmCount24h: 12 });
    ok(h1.grade === '正常' && h2.score < h1.score, '健康指数：正常状态高分、异常状态降级', `${h1.score}(${h1.grade}) vs ${h2.score}(${h2.grade})`);
    const alarm = { id: 1, level: 'critical', message: '接触力越限' };
    const wo = ms.createFromAlarm(alarm, 'PANTO-02', 200000);
    ok(wo.level === 'critical', '由严重告警自动生成同等级工单');
    report.sections.maintenance = { mttr: ms.mttr(), health: { normal: h1, abnormal: h2 }, auditEntries: ms.auditTrail(o.id).length };

    /* ---------------- 汇总 ---------------- */
    const summary = { pass, fail, generatedAt: new Date().toISOString(), results: report.sections };
    fs.mkdirSync(__dirname, { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(summary, null, 2));
    console.log(lines.join('\n'));
    console.log(`\n==== 测试汇总：PASS ${pass} / FAIL ${fail} ====`);
    console.log('指标报告：tests/report.json');
    process.exit(fail === 0 ? 0 : 1);
})();
