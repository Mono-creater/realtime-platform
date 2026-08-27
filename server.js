const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ModbusRTU = require('modbus-serial');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const {
    THRESHOLDS,
    parseMainPacket,
    parseSubPacket,
    anomaliesFromBitmap
} = require('./plc-packet');
const { createControlEngine } = require('./control-engine');

// 自动加载 .env（Node >= 20.19；通过 --env-file 启动时已有变量不会被覆盖）
try { process.loadEnvFile(); } catch { /* 无 .env 文件时忽略 */ }

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 托管前端静态文件（Vue 构建产物）
// ============================================================
app.use(express.static(path.join(__dirname, 'dist')));

// ============================================================
// 根路径响应（返回 index.html）
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ============================================================
// 检查是否为模拟模式
// ============================================================
// 运行时模式标志（运行中可能因 PLC 断连自动回退到模拟模式）
let SIMULATION_MODE = process.env.PLC_MODE === 'simulation';

// 条件加载 Prisma
let prisma = null;
if (!SIMULATION_MODE) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    console.log('✅ Prisma Client 已初始化');
  } catch {
    console.warn('⚠️ Prisma 加载失败，将以无数据库模式运行');
  }
} else {
  console.log('🔄 模拟模式已启用，跳过数据库连接');
}

// ============================================================
// 1. 原有业务逻辑（告警管理）
// ============================================================
// 2026-08-27 起清除内置模拟数据（原 6 条 2024 演示记录及饼图/统计初值）：
// 告警历史从空开始，真实数据由 PLC 告警或数据库加载（loadHistoryFromDB）提供
let currentWarningList = [];

let currentOverLimit = [
  { title: '压力超限', count: 0 },
  { title: '导高超限', count: 0 },
  { title: '燃弧超限', count: 0 },
  { title: '拉出值超限', count: 0 },
];

let currentPieData = {
  first: [],
  second: []
};

function broadcastFullUpdate() {
  io.emit('fullUpdate', {
    warningList: currentWarningList || [],
    overLimit: currentOverLimit || [],
    pieData: currentPieData || {},
  });
}

// ============================================================
// 内存告警列表公共操作（封顶 + 统计 + 唯一 ID）
// ============================================================
const MAX_MEMORY_WARNINGS = 500;

function updateOverLimitStats() {
  const counts = {};
  currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
  currentOverLimit = currentOverLimit.map(card => ({
    ...card,
    count: counts[card.title] || 0,
  }));
}

function pushWarning(warning) {
  currentWarningList.push(warning);
  if (currentWarningList.length > MAX_MEMORY_WARNINGS) {
    currentWarningList.splice(0, currentWarningList.length - MAX_MEMORY_WARNINGS);
  }
}

let memIdCounter = Date.now();
function nextMemId() { return ++memIdCounter; }

async function loadHistoryFromDB() {
  if (!prisma) {
    console.log('ℹ️ 跳过数据库加载（模拟模式），使用内存数据');
    return;
  }
  try {
    const history = await prisma.warningHistory.findMany({
      orderBy: { time: 'desc' },
      take: MAX_MEMORY_WARNINGS,
    });
    if (history.length > 0) {
      currentWarningList = history.map(item => ({
        id: item.id,
        code: item.code,
        content: item.content,
        time: item.time.toISOString().slice(0,10),
        worker: item.worker || '',
        remark: item.remark || '/',
      }));
    } else {
      console.log('ℹ️ 数据库为空，告警历史从空开始');
    }
    updateOverLimitStats();
    console.log(`✅ 当前加载 ${currentWarningList.length} 条记录`);
  } catch (err) {
    console.error('❌ 加载历史数据失败，使用内存默认数据:', err);
  }
}

async function saveWarningToHistory(warning) {
  if (!prisma) {
    console.log('💾 模拟模式：保存警告到内存（不持久化）', warning);
    return { id: nextMemId() };
  }
  const created = await prisma.warningHistory.create({
    data: {
      code: warning.code,
      content: warning.content,
      time: new Date(warning.time),
      worker: warning.worker,
      remark: warning.remark,
    },
  });
  return created;
}

// ---------- WebSocket 事件 ----------
io.on('connection', (socket) => {
  socket.emit('fullUpdate', {
    warningList: currentWarningList,
    overLimit: currentOverLimit,
    pieData: currentPieData,
  });

  socket.on('addWarning', async (newWarning) => {
    try {
      if (!newWarning || typeof newWarning !== 'object' || Array.isArray(newWarning)) return;
      const created = await saveWarningToHistory(newWarning);
      const memWarning = {
        id: created.id,
        code: newWarning.code,
        content: newWarning.content,
        time: newWarning.time,
        worker: newWarning.worker || '',
        remark: newWarning.remark || '/',
      };
      pushWarning(memWarning);
      updateOverLimitStats();
      broadcastFullUpdate();
    } catch (err) {
      console.error('❌ addWarning 处理失败:', err.message);
    }
  });

  socket.on('updatePie', (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const tab = data.tab;
    if (typeof tab !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(tab)) return;
    if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) return;
    currentPieData[tab] = data.data;
    broadcastFullUpdate();
  });
});

// ---------- HTTP API ----------
app.get('/api/test', async (req, res) => {
  if (!prisma) {
    return res.json({ count: currentWarningList.length });
  }
  const count = await prisma.warningHistory.count();
  res.json({ count });
});

app.get('/api/stats/summary', async (req, res) => {
  try {
    let todayCount;
    if (prisma) {
      const today = new Date().toISOString().slice(0,10);
      todayCount = await prisma.warningHistory.count({
        where: { time: { gte: new Date(today), lt: new Date(today + 'T23:59:59') } }
      });
    } else {
      const today = new Date().toISOString().slice(0,10);
      todayCount = currentWarningList.filter(item => item.time && item.time.startsWith(today)).length;
    }
    let health;
    if (todayCount === 0) {
      health = 100;
    } else {
      health = Math.round(100 - todayCount * 0.5);
      health = Math.min(100, Math.max(0, health));
    }
    res.json({
      onlineVehicles: 128,
      todayAlarms: todayCount,
      handleRate: 94,
      health: health
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/trend', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  if (!prisma) {
    const dates = [];
    const counts = [];
    for (let i = days-1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0,10);
      dates.push(dateStr.slice(5));
      const count = currentWarningList.filter(item => item.time && item.time.startsWith(dateStr)).length;
      counts.push(count);
    }
    return res.json({ dates, counts });
  }

  try {
    const results = await prisma.$queryRaw`
      SELECT DATE(time) as date, COUNT(*) as count
      FROM warning_history
      WHERE time >= ${startDate}
      GROUP BY DATE(time)
      ORDER BY date ASC
    `;
    const dates = results.map(r => r.date.toISOString().slice(5, 10));
    const counts = results.map(r => Number(r.count));
    res.json({ dates, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/distribution', async (req, res) => {
  if (!prisma) {
    const counts = {};
    currentWarningList.forEach(item => {
      counts[item.content] = (counts[item.content] || 0) + 1;
    });
    const data = Object.keys(counts).map(name => ({ name, value: counts[name] }));
    return res.json(data);
  }
  try {
    const results = await prisma.$queryRaw`
      SELECT content, COUNT(*) as count
      FROM warning_history
      GROUP BY content
    `;
    const data = results.map(r => ({ name: r.content, value: Number(r.count) }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  const { start, end, content } = req.query;
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 500;
  const where = {};
  if (content) where.content = content;
  if (start || end) {
    where.time = {};
    if (start) where.time.gte = new Date(start);
    if (end) where.time.lte = new Date(end);
  }

  if (!prisma) {
    let list = [...currentWarningList];
    if (content) list = list.filter(item => item.content === content);
    if (start) list = list.filter(item => item.time >= start);
    if (end) list = list.filter(item => item.time <= end);
    list.sort((a, b) => new Date(b.time) - new Date(a.time));
    return res.json(list.slice(0, limit));
  }

  try {
    const history = await prisma.warningHistory.findMany({
      where,
      orderBy: { time: 'desc' },
      take: limit,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alert', async (req, res) => {
  try {
    const {
      timestamp, alarmType, level, value, code, worker,
      carNumber, line, station, direction, location, mileage, speed,
      imageUrl, videoUrl
    } = req.body;

    const parsedTime = timestamp ? new Date(timestamp) : new Date();
    const time = isNaN(parsedTime.getTime()) ? new Date() : parsedTime;

    const data = {
      code: code || 'UNKNOWN',
      content: alarmType || '未知告警',
      time,
      worker: worker || 'SYSTEM',
      remark: imageUrl || '',
      level: level || '--',
      value: value || 0,
      carNumber: carNumber || '--',
      line: line || '--',
      station: station || '--',
      direction: direction || '--',
      location: location || '--',
      mileage: mileage || '--',
      speed: speed || 0,
      imageUrl: imageUrl || '',
      videoUrl: videoUrl || ''
    };

    let created;
    if (prisma) {
      created = await prisma.warningHistory.create({ data });
    } else {
      created = { id: nextMemId() };
    }

    const newWarning = {
      id: created.id,
      code: data.code,
      content: data.content,
      time: data.time.toISOString().slice(0, 10),
      worker: data.worker,
      remark: data.remark,
      level: data.level,
      value: data.value,
      carNumber: data.carNumber,
      line: data.line,
      station: data.station,
      direction: data.direction,
      location: data.location,
      mileage: data.mileage,
      speed: data.speed,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl
    };

    pushWarning(newWarning);
    updateOverLimitStats();
    broadcastFullUpdate();
    res.json({ success: true, id: created.id });
  } catch (err) {
    console.error('告警接收失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/warning/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return res.status(400).json({ error: '无效的ID' });
  }

  if (!prisma) {
    const warning = currentWarningList.find(w => w.id === numericId);
    if (!warning) {
      return res.status(404).json({ error: '记录不存在' });
    }
    return res.json(warning);
  }

  try {
    const warning = await prisma.warningHistory.findUnique({
      where: { id: numericId }
    });
    if (!warning) {
      return res.status(404).json({ error: '记录不存在' });
    }
    const result = {
      ...warning,
      time: warning.time.toISOString().slice(0, 10),
      createdAt: warning.createdAt.toISOString()
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/warning/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return res.status(400).json({ error: '无效的 ID' });
  }

  try {
    console.log(`🔍 尝试删除 ID: ${numericId}`);

    const index = currentWarningList.findIndex(w => Number(w.id) === numericId);
    if (index !== -1) {
      currentWarningList.splice(index, 1);
      console.log(`✅ 内存移除成功，剩余 ${currentWarningList.length} 条`);
    } else {
      console.warn(`⚠️ 内存中未找到 ID ${numericId}`);
    }

    if (prisma) {
      try {
        await prisma.warningHistory.delete({
          where: { id: numericId },
        });
        console.log(`✅ 数据库删除成功, ID: ${numericId}`);
      } catch (dbErr) {
        if (dbErr.code === 'P2025') {
          console.log(`ℹ️ 数据库中不存在 ID ${numericId}，跳过数据库删除`);
        } else {
          throw dbErr;
        }
      }
    }

    updateOverLimitStats();
    broadcastFullUpdate();

    res.json({ success: true, message: '记录已删除' });
  } catch (err) {
    console.error('❌ 删除失败详情:', err);
    console.error(err.stack);
    res.status(500).json({ error: err.message || '删除失败，请查看后端日志' });
  }
});

// 批量删除故障记录（故障总览勾选删除）
app.delete('/api/warnings', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids 必须是非空数组' });
  }
  const numericIds = [...new Set(ids.map(Number).filter(n => Number.isFinite(n)))];
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'ids 中没有有效数字' });
  }

  // 内存列表同步删除（无数据库模式下的数据源）
  const idSet = new Set(numericIds);
  const before = currentWarningList.length;
  currentWarningList = currentWarningList.filter(w => !idSet.has(Number(w.id)));
  const deletedMem = before - currentWarningList.length;

  // 数据库删除（deleteMany 对不存在的记录不报错）
  let deletedDb = 0;
  if (prisma) {
    try {
      const result = await prisma.warningHistory.deleteMany({
        where: { id: { in: numericIds } },
      });
      deletedDb = result.count;
    } catch (dbErr) {
      console.error('❌ 批量删除数据库记录失败:', dbErr.message);
      return res.status(500).json({ error: dbErr.message });
    }
  }

  updateOverLimitStats();
  broadcastFullUpdate();
  const deleted = prisma ? deletedDb : deletedMem;
  console.log(`🗑️ 批量删除故障记录: ${deleted} 条 (请求 ${numericIds.length} 条)`);
  res.json({ deleted, ids: numericIds });
});

// ============================================================
// 2. 文件上传模块
// ============================================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 已创建上传目录: ${uploadDir}`);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
});

// ============================================================
// PDF 导出：导出指定故障报告
// ============================================================
const PDFDocument = require('pdfkit');
const PDF_FONT_PATH = path.join(__dirname, 'src', 'assets', 'fonts', 'FZYTJW.TTF');

function formatPdfTime(t) {
    if (typeof t !== 'string') return '--';
    const d = new Date(t);
    return isNaN(d.getTime()) ? t : d.toLocaleString('zh-CN', { hour12: false });
}

app.get('/api/export/pdf/:id', async (req, res) => {
    const numericId = Number(req.params.id);
    if (isNaN(numericId)) {
        return res.status(400).json({ error: '无效的ID' });
    }

    // 查找故障记录（内存或数据库）
    let warning;
    if (prisma) {
        try {
            warning = await prisma.warningHistory.findUnique({ where: { id: numericId } });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
        if (warning) {
            warning = { ...warning, time: warning.time.toISOString().slice(0, 10) };
        }
    } else {
        warning = currentWarningList.find(w => Number(w.id) === numericId);
    }
    if (!warning) {
        return res.status(404).json({ error: '记录不存在' });
    }

    try {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fault-${numericId}.pdf"`);
        doc.registerFont('FZYTJW', PDF_FONT_PATH);
        doc.pipe(res);

        // 标题栏
        doc.rect(0, 0, doc.page.width, 90).fill('#0a2e5d');
        doc.font('FZYTJW').fontSize(24).fillColor('#ffffff')
            .text('故障报告', 0, 30, { align: 'center' });
        doc.fontSize(10)
            .text(`生成时间：${new Date().toLocaleString('zh-CN')}`, 0, 62, { align: 'center' });

        // 字段列表（基础字段 + 相机告警扩展字段）
        const fields = [
            ['故障编号', warning.code],
            ['故障类型', warning.content],
            ['预警时间', formatPdfTime(warning.time)],
            ['维修工号', warning.worker],
            ...(warning.level ? [['告警级别', warning.level]] : []),
            ...(warning.value !== undefined && warning.value !== null ? [['数值', String(warning.value)]] : []),
            ...(warning.carNumber ? [['车号', warning.carNumber]] : []),
            ...(warning.line ? [['线路', warning.line]] : []),
            ...(warning.station ? [['车站', warning.station]] : []),
            ...(warning.direction ? [['方向', warning.direction]] : []),
            ...(warning.location ? [['位置', warning.location]] : []),
            ...(warning.mileage ? [['里程', warning.mileage]] : []),
            ...(warning.speed !== undefined && warning.speed !== null ? [['速度', String(warning.speed)]] : []),
            ['备注', warning.remark || '/'],
        ];

        let y = 130;
        for (const [label, value] of fields) {
            doc.font('FZYTJW').fontSize(11).fillColor('#0a2e5d')
                .text(label, 60, y, { width: 100 });
            doc.fillColor('#333333')
                .text(String(value ?? '--'), 180, y, { width: 370 });
            y += 28;
            doc.moveTo(60, y - 8).lineTo(doc.page.width - 60, y - 8)
                .lineWidth(0.5).strokeColor('#c9d8ea').stroke();
        }

        doc.end();
    } catch (err) {
        console.error('❌ PDF 生成失败:', err);
        res.status(500).json({ error: 'PDF 生成失败' });
    }
});

app.use('/uploads', express.static(uploadDir));

// ============================================================
// 3. 数据采集模块（支持真实PLC和模拟模式）
// ============================================================
const PLC_CONFIG = {
    host: process.env.PLC_HOST || '192.168.1.88',
    port: parseInt(process.env.PLC_PORT) || 502,
    unitId: parseInt(process.env.PLC_UNIT_ID) || 1,
    registers: {
        temperature: parseInt(process.env.PLC_REG_TEMP) || 30001,
        pressure: parseInt(process.env.PLC_REG_PRESS) || 30002,
        humidity: parseInt(process.env.PLC_REG_HUMID) || 30003,
        status: parseInt(process.env.PLC_REG_STATUS) || 30004,
        seq: parseInt(process.env.PLC_REG_SEQ) || 30005,
        subBase: parseInt(process.env.PLC_REG_SUB_BASE) || 30011,
        writeForce: parseInt(process.env.PLC_REG_WRITE_FORCE) || 30021,
        writeHeight: parseInt(process.env.PLC_REG_WRITE_HEIGHT) || 30022
    },
    readInterval: parseInt(process.env.PLC_INTERVAL) || 2000,
    windowSize: parseInt(process.env.PLC_WINDOW) || 10
};

let plcClient = null;
let sensorBuffer = [];
let isPLCConnecting = false;
let realInterval = null;
let simulationInterval = null;
let isSimulationPaused = false;

// PLC 重连退避（失败后 2s 起步，翻倍至 30s 封顶）
const PLC_RECONNECT_INITIAL_MS = 2000;
const PLC_RECONNECT_MAX_MS = 30000;
let plcReconnectDelay = PLC_RECONNECT_INITIAL_MS;
let plcRetryAt = 0;

// ---------- 故障分析逻辑（阈值单一来源：plc-packet.js THRESHOLDS） ----------
function analyzeFault(data) {
    const faults = [];
    if (data.temperature > THRESHOLDS.tempHigh) {
        faults.push({
            type: '高温预警',
            level: 'warning',
            value: data.temperature,
            detail: `均值温度 ${data.temperature}°C > ${THRESHOLDS.tempHigh}°C`
        });
    } else if (data.temperature < THRESHOLDS.tempLow) {
        faults.push({
            type: '低温预警',
            level: 'warning',
            value: data.temperature,
            detail: `均值温度 ${data.temperature}°C < ${THRESHOLDS.tempLow}°C`
        });
    }
    if (data.pressure > THRESHOLDS.pressHigh) {
        faults.push({
            type: '高压报警',
            level: 'error',
            value: data.pressure,
            detail: `均值压力 ${data.pressure}kPa > ${THRESHOLDS.pressHigh}kPa`
        });
    } else if (data.pressure < THRESHOLDS.pressLow) {
        faults.push({
            type: '低压报警',
            level: 'error',
            value: data.pressure,
            detail: `均值压力 ${data.pressure}kPa < ${THRESHOLDS.pressLow}kPa`
        });
    }
    if (data.humidity > THRESHOLDS.humidHigh) {
        faults.push({
            type: '高湿预警',
            level: 'warning',
            value: data.humidity,
            detail: `均值湿度 ${data.humidity}% > ${THRESHOLDS.humidHigh}%`
        });
    }
    return faults;
}

function broadcastSensorData(avg, faults, extra = {}) {
    const payload = {
        timestamp: new Date().toISOString(),
        temperature: avg.temperature,
        pressure: avg.pressure,
        humidity: avg.humidity,
        faults: faults,
        type: faults.length > 0 ? 'alarm' : 'normal',
        // 扩展字段：数据源 / 异常子包 / 原始报文 / 控制状态
        source: extra.source || 'simulation',
        anomalies: extra.anomalies || faults,
        packet: extra.packet || null,
        control: extra.control || (controlEngine ? controlEngine.getStatus() : null)
    };
    io.emit('sensorData', payload);
    return payload;
}

// 告警去重：同类型 10s 内且数值变化 <5% 不重复入库（防 2s 轮询刷屏）
const lastAlarmAt = {};

async function handleAlarm(faults, avg) {
    for (const fault of faults) {
        const prev = lastAlarmAt[fault.type];
        const value = Number(fault.value) || 0;
        if (prev && Date.now() - prev.time < 10000
            && Math.abs(prev.value - value) <= Math.max(5, Math.abs(prev.value) * 0.05)) {
            continue; // 重复告警，跳过
        }
        lastAlarmAt[fault.type] = { time: Date.now(), value: value };
        const warning = {
            code: 'PLC_SENSOR',
            content: fault.type,
            time: new Date().toISOString(),
            worker: 'PLC_AUTO',
            remark: JSON.stringify({
                avg: avg,
                faults: faults,
                timestamp: new Date().toISOString()
            })
        };
        const created = await saveWarningToHistory(warning);
        const memWarning = {
            id: created.id,
            code: warning.code,
            content: warning.content,
            time: warning.time,
            worker: warning.worker,
            remark: warning.remark
        };
        pushWarning(memWarning);
    }

    updateOverLimitStats();
    broadcastFullUpdate();
}

// ---------- Modbus 请求互斥锁（FC03 读 / FC16 写串行化） ----------
let modbusChain = Promise.resolve();
function modbusEnqueue(fn) {
    const p = modbusChain.then(fn, fn);
    modbusChain = p.catch(() => {});
    return p;
}

// ---------- 控制引擎（双环 PID + Z-N 整定） ----------
const controlEngine = createControlEngine();
let latestSensor = null;        // 最近一次传感器均值（喂给控制引擎）
let lastPacket = null;          // 最近一次原始报文（/api/plc/packet 调试用）
let controlLoopInterval = null;
let lastWrittenForce = null;    // 写回去重
let lastWrittenHeight = null;
let lastWriteAt = 0;            // 最近写回时间：输出不变时每 5s 保活重写（ZN 整定期间输出恒定，防止 PLC 侧写回看门狗/模拟器漂移）

function startControlLoop() {
    if (controlLoopInterval) return;
    controlLoopInterval = setInterval(() => {
        const mode = SIMULATION_MODE ? 'simulation' : 'plc';
        controlEngine.tick(latestSensor, mode);

        // 写回：自动调节或整定中的回路，输出变化时 FC16 写 30021/30022；
        // 输出不变则每 5s 保活重写一次（整定阶跃期间输出恒定，防止 PLC 侧看门狗判超时）
        if (!SIMULATION_MODE && plcClient) {
            const st = controlEngine.getStatus();
            const tuning = st.tune && st.tune.state === 'sampling';
            const forceActive = st.loops.force.auto || (tuning && st.tune.loop === 'force');
            const postureActive = st.loops.posture.auto || (tuning && st.tune.loop === 'posture');
            const forceRaw = Math.round(Math.min(1000, Math.max(50, st.loops.force.output)) * 10); // 压力寄存器 ×10（1000kPa→10000，uint16 安全）
            const heightRaw = Math.round(Math.min(2600, Math.max(1000, st.loops.posture.output)));
            const anyActive = forceActive || postureActive;
            const forceChanged = forceRaw !== lastWrittenForce;
            const heightChanged = heightRaw !== lastWrittenHeight;
            const keepAlive = anyActive && Date.now() - lastWriteAt > 5000;
            if (anyActive && (forceChanged || heightChanged || keepAlive)) {
                if (forceChanged) lastWrittenForce = forceRaw;
                if (heightChanged) lastWrittenHeight = heightRaw;
                lastWriteAt = Date.now();
                modbusEnqueue(() => plcClient.writeRegisters(
                    PLC_CONFIG.registers.writeForce, [forceRaw, heightRaw]))
                    .catch((err) => console.error('⚠️ 写回 PLC 失败（不影响采集）:', err.message));
            }
        }
    }, controlEngine.config.controlInterval);
}

// ---------- 真实PLC采集 ----------
async function connectPLC() {
    if (isPLCConnecting) return null;
    isPLCConnecting = true;
    try {
        const client = new ModbusRTU();
        await client.connectTCP(PLC_CONFIG.host, { port: PLC_CONFIG.port });
        client.setID(PLC_CONFIG.unitId);
        console.log(`✅ 汇川 PLC 连接成功 (${PLC_CONFIG.host}:${PLC_CONFIG.port})`);
        isPLCConnecting = false;
        return client;
    } catch (err) {
        console.error(`❌ 汇川 PLC 连接失败 (${err.message})`);
        isPLCConnecting = false;
        return null;
    }
}

async function readAndBufferSensorData() {
    if (!plcClient) {
        if (Date.now() < plcRetryAt) return; // 退避等待中，跳过本次重连
        plcClient = await connectPLC();
        if (!plcClient) {
            plcReconnectDelay = Math.min(plcReconnectDelay * 2, PLC_RECONNECT_MAX_MS);
            plcRetryAt = Date.now() + plcReconnectDelay;
            console.warn(`⚠️ PLC 连接失败，${(plcReconnectDelay / 1000).toFixed(0)}s 后重试`);
            return;
        }
    }

    try {
        // 主包：30001-30005（地址连续，一次批量读取）
        const regs = await modbusEnqueue(() =>
            plcClient.readHoldingRegisters(PLC_CONFIG.registers.temperature, 5)
                .then((r) => r.data));
        const packet = parseMainPacket(regs);
        plcReconnectDelay = PLC_RECONNECT_INITIAL_MS; // 读取成功，重置退避

        if (packet.extended) {
            // ===== 新固件扩展协议：直接用 PLC 侧 10 条均值，不再二次平均 =====
            const avg = {
                temperature: Math.round(packet.temperature * 10) / 10,
                pressure: Math.round(packet.pressure * 100) / 100,
                humidity: Math.round(packet.humidity * 10) / 10
            };
            latestSensor = avg;

            let sub = null;
            let faults = [];
            if (packet.subValid) {
                const subRegs = await modbusEnqueue(() =>
                    plcClient.readHoldingRegisters(PLC_CONFIG.registers.subBase, 5)
                        .then((r) => r.data));
                sub = parseSubPacket(subRegs);
                faults = anomaliesFromBitmap(sub.bitmap || packet.anomalyBitmap, sub.values);
            } else if (packet.anomalyBitmap) {
                faults = anomaliesFromBitmap(packet.anomalyBitmap, {
                    temperature: packet.temperature,
                    pressure: packet.pressure,
                    humidity: packet.humidity
                });
            }
            lastPacket = { source: 'plc', main: packet, sub, receivedAt: Date.now() };
            broadcastSensorData(avg, faults, {
                source: 'plc', anomalies: faults, packet: lastPacket
            });
            if (faults.length > 0) {
                await handleAlarm(faults, avg);
                console.log(`🚨 [PLC] seq=${packet.seq} 检测到 ${faults.length} 个异常（子包序号=${sub ? sub.subSeq : '-'}）`);
            }
        } else {
            // ===== 旧固件回退：平台侧 10 条缓冲均值 =====
            const record = {
                timestamp: Date.now(),
                temperature: Math.round(packet.temperature * 10) / 10,
                pressure: Math.round(packet.pressure * 100) / 100,
                humidity: Math.round(packet.humidity * 10) / 10
            };
            sensorBuffer.push(record);
            if (sensorBuffer.length >= PLC_CONFIG.windowSize) {
                await processBuffer();
            }
        }
    } catch (err) {
        console.error('❌ 读取传感器数据失败:', err.message);
        plcClient = null;
        plcReconnectDelay = Math.min(plcReconnectDelay * 2, PLC_RECONNECT_MAX_MS);
        plcRetryAt = Date.now() + plcReconnectDelay;
    }
}

async function processBuffer() {
    if (sensorBuffer.length === 0) return;
    const sum = sensorBuffer.reduce((acc, cur) => {
        acc.temp += cur.temperature;
        acc.press += cur.pressure;
        acc.humid += cur.humidity;
        return acc;
    }, { temp: 0, press: 0, humid: 0 });
    const count = sensorBuffer.length;
    const avg = {
        temperature: Math.round((sum.temp / count) * 10) / 10,
        pressure: Math.round((sum.press / count) * 100) / 100,
        humidity: Math.round((sum.humid / count) * 10) / 10
    };
    latestSensor = avg;
    const faults = analyzeFault(avg);
    broadcastSensorData(avg, faults, { source: 'fallback' });
    if (faults.length > 0) {
        await handleAlarm(faults, avg);
        console.log(`🚨 [旧固件回退] 检测到 ${faults.length} 个故障`);
    }
    sensorBuffer = [];
}

function startSimulation() {
    if (simulationInterval) return;
    if (realInterval) {
        clearInterval(realInterval);
        realInterval = null;
    }
    console.log('🔄 模拟模式已启动，将生成随机传感器数据');
    simulationInterval = setInterval(() => {
        if (isSimulationPaused) return;
        let temp = Math.round((20 + Math.random() * 70) * 10) / 10;
        let pressure = Math.round((50 + Math.random() * 1150) * 100) / 100;
        let humidity = Math.round((20 + Math.random() * 75) * 10) / 10;

        if (Math.random() < 0.3) {
            const choice = Math.floor(Math.random() * 3);
            if (choice === 0) temp = 80 + Math.random() * 20;
            else if (choice === 1) pressure = 1000 + Math.random() * 300;
            else humidity = 85 + Math.random() * 15;
        }

        const avg = {
            temperature: Math.round(temp * 10) / 10,
            pressure: Math.round(pressure * 100) / 100,
            humidity: Math.round(humidity * 10) / 10
        };
        latestSensor = avg;
        const faults = analyzeFault(avg);
        broadcastSensorData(avg, faults, { source: 'simulation' });
        if (faults.length > 0) {
            handleAlarm(faults, avg).catch(console.error);
            console.log(`🚨 [模拟] 检测到 ${faults.length} 个故障`);
        }
    }, PLC_CONFIG.readInterval);
}

async function startRealCollection() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    isSimulationPaused = false;
    plcClient = await connectPLC();
    if (plcClient) {
        SIMULATION_MODE = false;
        realInterval = setInterval(readAndBufferSensorData, PLC_CONFIG.readInterval);
        setTimeout(readAndBufferSensorData, 500);
        console.log('✅ 切换到真实PLC模式');
    } else {
        console.warn('⚠️ 真实PLC连接失败，自动切换到模拟模式');
        SIMULATION_MODE = true;
        startSimulation();
    }
}

// ---------- API：查询和切换模式 ----------
app.get('/api/plc/mode', (req, res) => {
    res.json({ mode: SIMULATION_MODE ? 'simulation' : 'real' });
});

app.post('/api/plc/mode', async (req, res) => {
    const { mode } = req.body;
    if (mode !== 'simulation' && mode !== 'real') {
        return res.status(400).json({ error: '模式必须是 simulation 或 real' });
    }
    if ((mode === 'simulation' && SIMULATION_MODE) || (mode === 'real' && !SIMULATION_MODE)) {
        return res.json({ mode: mode, message: '已经是该模式' });
    }

    if (mode === 'simulation') {
        SIMULATION_MODE = true;
        if (realInterval) {
            clearInterval(realInterval);
            realInterval = null;
        }
        plcClient = null;
        sensorBuffer = [];
        startSimulation();
    } else {
        SIMULATION_MODE = false;
        if (simulationInterval) {
            clearInterval(simulationInterval);
            simulationInterval = null;
        }
        plcClient = null;
        sensorBuffer = [];
        await startRealCollection();
    }
    res.json({ mode: mode, message: `已切换到 ${mode} 模式` });
});

app.get('/api/simulation/pause', (req, res) => {
    res.json({ paused: isSimulationPaused });
});

app.post('/api/simulation/pause', (req, res) => {
    const body = req.body;
    if (body && typeof body.paused === 'boolean') {
        isSimulationPaused = body.paused;
    } else {
        isSimulationPaused = !isSimulationPaused; // 兼容旧调用：无 body 时切换
    }
    console.log(`⏸️ 模拟数据${isSimulationPaused ? '已暂停' : '已恢复'}`);
    res.json({ paused: isSimulationPaused });
});

// ---------- API：PLC 报文与控制引擎 ----------
app.get('/api/plc/packet', (req, res) => {
    res.json(lastPacket || { source: 'plc', main: null, sub: null, receivedAt: null });
});

app.get('/api/control/status', (req, res) => {
    res.json(controlEngine.getStatus());
});

app.post('/api/control/params', (req, res) => {
    const { loop, kp, ki, kd, target } = req.body || {};
    if (loop !== 'force' && loop !== 'posture') {
        return res.status(400).json({ error: 'loop 必须是 force 或 posture' });
    }
    const r = controlEngine.setParams(loop, { kp, ki, kd, target });
    if (!r.ok) return res.status(400).json({ error: r.error });
    console.log(`🎛️ PID 参数已更新 [${loop}]`, { kp, ki, kd, target });
    res.json({ ok: true, status: controlEngine.getStatus() });
});

app.post('/api/control/auto', (req, res) => {
    const { loop, enabled } = req.body || {};
    if (loop !== 'force' && loop !== 'posture') {
        return res.status(400).json({ error: 'loop 必须是 force 或 posture' });
    }
    const r = controlEngine.setAuto(loop, enabled !== false);
    if (!r.ok) return res.status(400).json({ error: r.error });
    console.log(`🤖 自动调节 [${loop}] ${enabled !== false ? '开启' : '关闭'}`);
    res.json({ ok: true, status: controlEngine.getStatus() });
});

app.post('/api/control/tune', (req, res) => {
    const { loop } = req.body || {};
    const r = controlEngine.startTune(loop);
    if (!r.ok) return res.status(400).json({ error: r.error });
    console.log(`📈 Z-N 阶跃整定已开始 [${loop}]，阶跃 Δu=${r.stepDelta}`);
    res.json({ ok: true, stepDelta: r.stepDelta, status: controlEngine.getStatus() });
});

app.post('/api/control/tune/cancel', (req, res) => {
    const r = controlEngine.cancelTune();
    if (!r.ok) return res.status(400).json({ error: r.error });
    console.log('🛑 Z-N 整定已取消');
    res.json({ ok: true, status: controlEngine.getStatus() });
});

// ============================================================
// 4. 清除模拟数据 API
// ============================================================
app.delete('/api/simulation/clear', async (req, res) => {
    try {
        const before = currentWarningList.length;
        currentWarningList = currentWarningList.filter(w => w.code !== 'PLC_SENSOR');
        const removed = before - currentWarningList.length;

        updateOverLimitStats();
        broadcastFullUpdate();
        console.log(`🧹 已清除 ${removed} 条模拟告警记录`);
        res.json({ success: true, memRemoved: removed });
    } catch (err) {
        console.error('❌ 清除模拟数据失败:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// 5. 启动服务器
// ============================================================
const PORT = process.env.PORT || 3000;
(async () => {
    await loadHistoryFromDB();
    server.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
        console.log(`📡 WebSocket 服务已启动`);
        console.log(`📁 上传文件保存至: ${uploadDir}`);
    });

    if (SIMULATION_MODE) {
        startSimulation();
    } else {
        await startRealCollection();
    }

    startControlLoop(); // 双环 PID 控制引擎（模拟/真实模式均驱动）
})();
