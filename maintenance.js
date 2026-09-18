/**
 * maintenance.js —— 运维闭环升级（行业需求：状态修、工单化、健康分级、留痕可审计）
 *
 * 功能：
 *  1) 工单状态机：新建 → 指派 → 处理中 → 完成 → 复核关闭（含取消），全过程带审计轨迹；
 *  2) 健康指数（0~100）与检修建议分级：综合“接触力偏离目标、接触力波动、温度越限程度、
 *     24 h 告警频次”四项扣分，输出 正常 / 关注 / 计划检修 / 立即检修 四档建议，
 *     对应行业推行的“分级整备、状态修”组织方式；
 *  3) 运维 KPI：MTTR（平均修复时间）等，取自 standards 的公式；
 *  4) 审计：每次状态变更记录 操作人、时间、备注，满足检修留痕要求。
 *
 * 说明：健康指数为多指标加权的**代理指标**（在缺少滑板厚度直接测量时使用），
 *       权重与扣分上限为工程默认值，投运前应按线路实测数据标定；
 *       若后续接入厚度/磨耗量传感器，可直接替换为 RUL 模型输出。
 * 无第三方依赖。
 */

'use strict';

const std = require('./standards');

const GRADE = [
    { min: 85, grade: '正常', advice: '按周期巡检，保持常规监测' },
    { min: 70, grade: '关注', advice: '加密监测频次，纳入下次天窗复检' },
    { min: 55, grade: '计划检修', advice: '安排计划检修工单，检查气路与接触压力' },
    { min: 0, grade: '立即检修', advice: '触发紧急工单，停运检查碳滑板与受电弓状态' },
];

class MaintenanceService {
    constructor(opts = {}) {
        this.seq = 0;
        this.orders = [];
        this.cfg = Object.assign({
            forcePenaltyCap: 25,     // 接触力偏离扣分上限
            wavePenaltyCap: 25,      // 波动扣分上限
            tempPenaltyCap: 25,      // 温度越限扣分上限
            alarmPenaltyCap: 25,     // 告警频次扣分上限
            alarmRefCount: 10,       // 24 h 告警次数参考值
        }, opts);
    }

    _id() { return 'WO' + String(++this.seq).padStart(5, '0'); }

    create({ deviceId, alarmId, level = 'warning', description = '', at }) {
        const t0 = at !== undefined ? at : Date.now();
        const o = {
            id: this._id(), deviceId, alarmId, level, description,
            status: 'new', createdAt: t0, assignee: null,
            startedAt: null, completedAt: null, verifiedAt: null, remark: '', healthAtCreate: null,
            audit: [{ at: t0, action: 'create', worker: 'system', note: description }],
        };
        this.orders.push(o);
        return o;
    }

    _transition(id, action, worker, at, note) {
        const o = this.orders.find((x) => x.id === id);
        if (!o) return { ok: false, error: '工单不存在' };
        const map = { assign: ['new', 'assigned'], start: ['assigned', 'in_progress'], complete: ['in_progress', 'completed'], verify: ['completed', 'verified'], cancel: ['new', 'cancelled'] };
        const [from, to] = map[action] || [];
        if (from && o.status !== from) return { ok: false, error: `状态不允许：${o.status} 不能执行 ${action}` };
        o.status = to;
        const t = at !== undefined ? at : Date.now();
        if (action === 'assign') { o.assignee = worker; }
        if (action === 'start') { o.startedAt = t; }
        if (action === 'complete') { o.completedAt = t; if (note) o.remark = note; }
        if (action === 'verify') { o.verifiedAt = t; if (note) o.remark = note; }
        o.audit.push({ at: t, action, worker: worker || 'system', note: note || '' });
        return { ok: true, order: o };
    }

    assign(id, worker, at) { return this._transition(id, 'assign', worker, at, ''); }
    start(id, worker, at) { return this._transition(id, 'start', worker, at, ''); }
    complete(id, worker, at, note) { return this._transition(id, 'complete', worker, at, note); }
    verify(id, worker, at, note) { return this._transition(id, 'verify', worker, at, note); }
    cancel(id, worker, at, note) { return this._transition(id, 'cancel', worker, at, note); }

    list(filter = {}) { return this.orders.filter((o) => !filter.status || o.status === filter.status); }
    auditTrail(id) { const o = this.orders.find((x) => x.id === id); return o ? o.audit : []; }
    mttr() { return std.mttr(this.orders); }

    /**
     * 健康指数（代理指标）
     * @param {{forceMean:number, forceTarget:number, forceStd?:number, tempMax?:number, tempLimit?:number, alarmCount24h?:number}} m
     */
    healthIndex(m) {
        const c = this.cfg;
        const target = m.forceTarget || 100;
        const devPct = Math.abs((m.forceMean - target) / target) * 100;
        const pForce = Math.min(c.forcePenaltyCap, devPct * 0.5);
        const wavePct = m.forceStd !== undefined ? (m.forceStd / target) * 100 : 0;
        const pWave = Math.min(c.wavePenaltyCap, wavePct * 0.8);
        const tLim = m.tempLimit !== undefined ? m.tempLimit : 80;
        const tOver = m.tempMax !== undefined ? Math.max(0, m.tempMax - tLim) : 0;
        const pTemp = Math.min(c.tempPenaltyCap, tOver * 2.5);
        const alarms = m.alarmCount24h || 0;
        const pAlarm = Math.min(c.alarmPenaltyCap, (alarms / c.alarmRefCount) * c.alarmPenaltyCap);
        const score = Math.max(0, Math.round(100 - (pForce + pWave + pTemp + pAlarm)));
        const g = GRADE.find((x) => score >= x.min);
        return {
            score, grade: g.grade, advice: g.advice,
            penalties: { force: +pForce.toFixed(1), wave: +pWave.toFixed(1), temp: +pTemp.toFixed(1), alarm: +pAlarm.toFixed(1) },
            note: '代理指标：无滑板厚度直接测量时使用，投运前应按线路数据标定',
        };
    }

    /** 由告警自动生成工单（分级→工单等级映射） */
    createFromAlarm(alarm, deviceId, at) {
        const levelMap = { warning: 'warning', major: 'major', critical: 'critical' };
        return this.create({
            deviceId, alarmId: alarm.id, level: levelMap[alarm.level] || 'warning',
            description: `[${alarm.level}] ${alarm.message}`, at,
        });
    }
}

module.exports = { MaintenanceService, GRADE };
