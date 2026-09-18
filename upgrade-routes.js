/**
 * upgrade-routes.js —— 升级能力的 REST 入口（挂载即生效，无需改动既有 server.js 内部逻辑）
 *
 * 集成方式（在 server.js 中加两行即可）：
 *   const createUpgradeRouter = require('./upgrade-routes');
 *   app.use('/api/v2', createUpgradeRouter({ autoCreateOrder: true }));
 *
 * 提供接口：
 *   GET  /api/v2/standards/force-target?v=80&system=AC   目标平均接触力与动态限值
 *   GET  /api/v2/standards/check?v=80&mean=..&std=..     接触力一致性校验
 *   POST /api/v2/ingest                                  采样上报（驱动告警引擎与链路监视）
 *   GET  /api/v2/alarms                                  告警列表与统计
 *   POST /api/v2/alarms/:id/ack | /clear                 告警确认 / 解除
 *   GET  /api/v2/link                                    链路质量（丢包率、质量码）
 *   GET  /api/v2/orders | POST /api/v2/orders            工单查询 / 创建
 *   POST /api/v2/orders/:id/:action                      工单流转（assign/start/complete/verify/cancel）
 *   GET  /api/v2/health?forceMean=..&forceTarget=..      健康指数与检修建议
 *   GET  /api/v2/kpi                                     运维 KPI（告警时延、MTTR、可用率、丢包率）
 */

'use strict';

const express = require('express');
const std = require('./standards');
const { AlarmEngine } = require('./alarm-engine');
const { LinkMonitor } = require('./link-monitor');
const { MaintenanceService } = require('./maintenance');

module.exports = function createUpgradeRouter(opts = {}) {
    const router = express.Router();
    const alarms = new AlarmEngine(opts.alarm || {});
    const link = new LinkMonitor(opts.link || {});
    const maint = new MaintenanceService(opts.maintenance || {});
    const state = { lastSample: null, uptimeStart: Date.now(), downMs: 0, speed: 0 };

    router.get('/standards/force-target', (req, res) => {
        const v = Number(req.query.v) || 0;
        const t = std.targetMeanContactForce(v, { system: req.query.system || 'AC' });
        res.json({ v, system: t.system, target: +t.value.toFixed(2), limits: std.dynamicLimits(t.value), ref: std.STANDARD_REF.forceLaw });
    });

    router.get('/standards/check', (req, res) => {
        const out = std.evaluateContactForce({
            v: Number(req.query.v) || 0, mean: Number(req.query.mean),
            std: req.query.std !== undefined ? Number(req.query.std) : undefined,
            system: req.query.system || 'AC',
        });
        res.json(out);
    });

    router.post('/ingest', (req, res) => {
        const body = req.body || {};
        const t = body.t !== undefined ? Number(body.t) : Date.now();
        state.lastSample = { t, temperature: body.temperature, pressure: body.pressure, humidity: body.humidity };
        if (body.speed !== undefined) state.speed = Number(body.speed);
        link.onPacket({ t, seq: body.seq !== undefined ? Number(body.seq) : null });
        const newAlarms = alarms.push(Object.assign({ t }, state.lastSample));
        const orders = [];
        if (opts.autoCreateOrder) {
            for (const a of newAlarms) {
                if (a.level === 'major' || a.level === 'critical') {
                    orders.push(maint.createFromAlarm(a, body.deviceId || 'UNKNOWN', t));
                }
            }
        }
        res.json({ ok: true, alarms: newAlarms, orders, alarmStats: alarms.stats(), link: link.stats(t) });
    });

    router.get('/alarms', (req, res) => res.json({ list: alarms.alarms, stats: alarms.stats() }));
    router.post('/alarms/:id/ack', (req, res) => res.json(alarms.ack(Number(req.params.id), (req.body || {}).worker)));
    router.post('/alarms/:id/clear', (req, res) => res.json(alarms.clear(Number(req.params.id))));

    router.get('/link', (req, res) => res.json(link.stats(Date.now())));
    router.post('/link/error', (req, res) => { link.onError(); res.json({ nextRetryMs: link.nextRetryDelay(), stats: link.stats() }); });

    router.get('/orders', (req, res) => res.json({ list: maint.list({ status: req.query.status }), mttr: maint.mttr() }));
    router.post('/orders', (req, res) => res.json(maint.create(Object.assign({ at: Date.now() }, req.body || {}))));
    router.post('/orders/:id/:action', (req, res) => {
        const { id, action } = req.params;
        const worker = (req.body || {}).worker;
        const note = (req.body || {}).note;
        const at = (req.body || {}).at;
        const fn = maint[action];
        if (typeof fn !== 'function') return res.status(400).json({ ok: false, error: '未知动作' });
        res.json(fn.call(maint, id, worker, at, note));
    });

    router.get('/health', (req, res) => {
        const q = req.query;
        res.json(Object.assign(maint.healthIndex({
            forceMean: Number(q.forceMean), forceTarget: Number(q.forceTarget) || 100,
            forceStd: q.forceStd !== undefined ? Number(q.forceStd) : undefined,
            tempMax: q.tempMax !== undefined ? Number(q.tempMax) : undefined,
            alarmCount24h: q.alarmCount24h !== undefined ? Number(q.alarmCount24h) : undefined,
        }), { note: '代理指标，投运前应按线路数据标定' }));
    });

    router.get('/kpi', (req, res) => {
        const runtimeMs = Date.now() - state.uptimeStart;
        const ls = link.stats(Date.now());
        res.json({
            availability: +std.availability(state.downMs, runtimeMs).toFixed(4),
            dataCompleteness: +std.dataCompleteness(ls.packets - ls.gaps, Math.max(ls.expected, 1)).toFixed(4),
            lossRate: ls.lossRate, quality: ls.quality,
            alarmLatency: alarms.stats().latency, mttrMin: maint.mttr(),
            alarms: alarms.stats().byLevel, orders: maint.list().length,
            standardRef: std.STANDARD_REF,
        });
    });

    return router;
};
