/**
 * alarm-engine.js —— 告警引擎升级（行业需求：分级告警、抑制抖动、缓变早发现、可追溯）
 *
 * 处理链：中值滤波(抗单点尖峰) → 阈值分级 + 变化率(ROC)判据 → 连续确认 → 抑制/去重 → 确认与解除
 * 设计要点：
 *  1) 阈值沿用现场既有取值（温度 80/-10 ℃、压力 1000/100 kPa、湿度 85 %RH），并扩展为
 *     warning/major/critical 三级（standards.ALARM_DEFAULTS，可按线路标定）；
 *  2) 增加变化率判据：对缓慢漂移（如温升 3 ℃/min）可在阈值越限前给出预警，
 *     直接回应“缓变异常发现滞后”的运维痛点；
 *  3) 连续确认（n 点确认/窗口）与抑制窗口（去重）抑制抖动误报；
 *  4) 记录确认人/确认时间/解除时间与来源判据，满足检修留痕与审计要求。
 *
 * 无第三方依赖。
 */

'use strict';

const std = require('./standards');

function median3(a, b, c) { return [a, b, c].sort((x, y) => x - y)[1]; }

class AlarmEngine {
    constructor(opts = {}) {
        this.cfg = Object.assign({
            thresholds: std.ALARM_DEFAULTS,
            rocWindowMs: 60000,      // 变化率统计窗口：1 min
            confirmN: 2,             // 连续确认点数
            suppressMs: 120000,      // 同源同级抑制窗口：2 min
            medianOnly: true,        // true=仅中值滤波（低时延）；false=再叠加 5 点均值
            avgWindow: 5,
        }, opts);
        this.history = [];
        this.state = {};              // signal -> {level, count}
        this.alarms = [];
        this.suppressed = 0;
        this.seq = 0;
    }

    _filter(sample) {
        this.history.push(sample);
        const maxHist = Math.max(64, Math.ceil(this.cfg.rocWindowMs / 1000) + 8);
        if (this.history.length > maxHist) this.history.shift();
        const n = this.history.length;
        const out = {};
        for (const sig of ['temperature', 'pressure', 'humidity']) {
            const v1 = this.history[n - 1] ? this.history[n - 1][sig] : undefined;
            const v2 = n >= 2 ? this.history[n - 2][sig] : v1;
            const v3 = n >= 3 ? this.history[n - 3][sig] : v2;
            let v = (v1 === undefined) ? undefined : median3(v3, v2, v1);
            if (!this.cfg.medianOnly) {
                const w = this.history.slice(-this.cfg.avgWindow).map((h) => h[sig]).filter((x) => x !== undefined);
                v = w.reduce((a, b) => a + b, 0) / w.length;
            }
            out[sig] = v;
        }
        return out;
    }

    _roc(sig, now) {
        const h = this.history;
        if (h.length < 2) return 0;
        const ref = h.find((x) => now - x.t >= this.cfg.rocWindowMs) || h[0];
        const cur = h[h.length - 1];
        const dtMin = Math.max((cur.t - ref.t) / 60000, 1 / 60);
        return (cur[sig] - ref[sig]) / dtMin;
    }

    /** 单信号分级：阈值 + 变化率取较高者 */
    _grade(sig, v, roc) {
        const th = this.cfg.thresholds[sig];
        let lv = 'normal', src = null;
        const hi = (lim) => lim !== undefined && v > lim;
        if (hi(th.criticalHigh)) { lv = 'critical'; src = 'threshold'; }
        else if (hi(th.majorHigh)) { lv = 'major'; src = 'threshold'; }
        else if (hi(th.warningHigh)) { lv = 'warning'; src = 'threshold'; }
        else if (th.majorLow !== undefined && v < th.majorLow) { lv = 'major'; src = 'threshold'; }
        else if (th.warningLow !== undefined && v < th.warningLow) { lv = 'warning'; src = 'threshold'; }
        if (roc !== undefined && th.rocPerMin) {
            let rl = 'normal';
            if (roc >= th.rocPerMin.major) rl = 'major';
            else if (roc >= th.rocPerMin.warning) rl = 'warning';
            if (std.SEVERITY_ORDER[rl] > std.SEVERITY_ORDER[lv]) { lv = rl; src = 'roc'; }
        }
        return { level: lv, source: src };
    }

    /**
     * 推入一个采样（t 为 ms）
     * @returns {Array} 本次新产生的告警
     */
    push(sample) {
        const s = Object.assign({}, sample);
        const f = this._filter(s);
        const out = [];
        for (const sig of ['temperature', 'pressure', 'humidity']) {
            const v = f[sig];
            if (v === undefined) continue;
            const roc = this._roc(sig, s.t);
            const g = this._grade(sig, v, roc);
            const st = this.state[sig] || (this.state[sig] = { level: 'normal', count: 0 });
            if (std.SEVERITY_ORDER[g.level] >= std.SEVERITY_ORDER.warning) {
                if (g.level === st.level) st.count += 1; else { st.level = g.level; st.count = 1; }
                if (st.count >= this.cfg.confirmN) {
                    const last = this.alarms.filter((a) => a.signal === sig && a.level === g.level).slice(-1)[0];
                    if (last && s.t - last.t < this.cfg.suppressMs) { this.suppressed += 1; continue; }
                    const alarm = {
                        id: ++this.seq,
                        t: s.t,
                        signal: sig,
                        level: g.level,
                        value: +Number(v).toFixed(2),
                        roc: +Number(roc).toFixed(3),
                        source: g.source,
                        threshold: this.cfg.thresholds[sig],
                        message: this._message(sig, g, v, roc),
                        status: 'active',
                        worker: null, ackAt: null, clearAt: null,
                        truthOnsetMs: s.truthOnsetMs !== undefined ? s.truthOnsetMs : null,
                        latencyMs: s.truthOnsetMs !== undefined ? Math.round(s.t - s.truthOnsetMs) : null,
                    };
                    this.alarms.push(alarm);
                    out.push(alarm);
                }
            } else {
                st.level = 'normal'; st.count = 0;
            }
        }
        return out;
    }

    _message(sig, g, v, roc) {
        const th = this.cfg.thresholds[sig], unit = th.unit || '';
        if (g.source === 'roc') return `${sig} 变化率 ${roc.toFixed(2)} ${unit}/min 超过 ${g.level} 级判据`;
        return `${sig} = ${Number(v).toFixed(2)} ${unit} 越限（${g.level}）`;
    }

    ack(id, worker, t) {
        const a = this.alarms.find((x) => x.id === id);
        if (!a) return { ok: false, error: '告警不存在' };
        a.status = 'acked'; a.worker = worker || a.worker; a.ackAt = t || a.ackAt || Date.now();
        return { ok: true, alarm: a };
    }

    clear(id, t) {
        const a = this.alarms.find((x) => x.id === id);
        if (!a) return { ok: false, error: '告警不存在' };
        a.status = 'cleared'; a.clearAt = t || Date.now();
        return { ok: true, alarm: a };
    }

    stats() {
        const byLevel = { warning: 0, major: 0, critical: 0 };
        const lat = [];
        for (const a of this.alarms) { byLevel[a.level] = (byLevel[a.level] || 0) + 1; if (a.latencyMs !== null) lat.push(a.latencyMs); }
        return {
            total: this.alarms.length, byLevel, suppressed: this.suppressed,
            acked: this.alarms.filter((a) => a.status !== 'active').length,
            latency: std.latencyStats(lat),
        };
    }
}

module.exports = { AlarmEngine, median3 };
