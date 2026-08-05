const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const ModbusRTU = require('modbus-serial');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const prisma = new PrismaClient();

// ============================================================
// 1. 原有业务逻辑（告警管理）
// ============================================================
let currentWarningList = [
  { id: 1, code: '451698205212', content: '压力超限', time: '2024-12-15', worker: 'WX-0365', remark: '/' },
  { id: 2, code: '451698205238', content: '压力超限', time: '2024-12-07', worker: 'WX-0358', remark: '/' },
  { id: 3, code: '788020547496', content: '导高超限', time: '2024-11-23', worker: 'WX-0322', remark: '/' },
  { id: 4, code: '451698205289', content: '压力超限', time: '2024-11-20', worker: 'WX-0347', remark: '/' },
  { id: 5, code: '788020547466', content: '导高超限', time: '2024-10-31', worker: 'WX-0327', remark: '/' },
  { id: 6, code: '788020547474', content: '燃弧超限', time: '2024-10-20', worker: 'WX-0389', remark: '/' },
];

let currentOverLimit = [
  { title: '压力超限', count: 4 },
  { title: '导高超限', count: 1 },
  { title: '燃弧超限', count: 1 },
  { title: '拉出值超限', count: 0 },
];

let currentPieData = {
  first: [
    { name: '压力超限', value: 66, color: '#2ca7e0' },
    { name: '导高超限', value: 17, color: '#1b8edb' },
    { name: '拉出值超限', value: 17, color: '#0e6fb7' },
  ],
  second: [
    { name: '压力超限', value: 56, color: '#2ca7e0' },
    { name: '导高超限', value: 27, color: '#1b8edb' },
    { name: '拉出值超限', value: 17, color: '#0e6fb7' },
  ]
};

function broadcastFullUpdate() {
  io.emit('fullUpdate', {
    warningList: currentWarningList || [],
    overLimit: currentOverLimit || [],
    pieData: currentPieData || {},
  });
}

async function loadHistoryFromDB() {
  try {
    const history = await prisma.warningHistory.findMany({
      orderBy: { time: 'desc' },
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
      console.log('⚠️ 数据库为空，使用内存模拟数据');
    }
    const counts = {};
    currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
    currentOverLimit = currentOverLimit.map(card => ({
      ...card,
      count: counts[card.title] || 0,
    }));
    console.log(`✅ 当前加载 ${currentWarningList.length} 条记录`);
  } catch (err) {
    console.error('❌ 加载历史数据失败，使用内存默认数据:', err);
  }
}

async function saveWarningToHistory(warning) {
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
  console.log('新设备连接:', socket.id);

  socket.emit('fullUpdate', {
    warningList: currentWarningList,
    overLimit: currentOverLimit,
    pieData: currentPieData,
  });

  socket.on('addWarning', async (newWarning) => {
    const created = await saveWarningToHistory(newWarning);
    const memWarning = {
      id: created.id,
      code: newWarning.code,
      content: newWarning.content,
      time: newWarning.time,
      worker: newWarning.worker || '',
      remark: newWarning.remark || '/',
    };
    currentWarningList.push(memWarning);

    const counts = {};
    currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
    currentOverLimit = currentOverLimit.map(card => ({
      ...card,
      count: counts[card.title] || 0,
    }));
    broadcastFullUpdate();
  });

  socket.on('updatePie', (data) => {
    currentPieData[data.tab] = data.data;
    broadcastFullUpdate();
  });

  socket.on('disconnect', () => {
    console.log('设备断开:', socket.id);
  });
});

// ---------- HTTP API ----------
app.get('/api/test', async (req, res) => {
  const count = await prisma.warningHistory.count();
  res.json({ count });
});

app.get('/api/stats/summary', async (req, res) => {
  try {
    const total = await prisma.warningHistory.count();
    const today = new Date().toISOString().slice(0,10);
    const todayCount = await prisma.warningHistory.count({
      where: { time: { gte: new Date(today), lt: new Date(today + 'T23:59:59') } }
    });
    let health;
    if (total === 0) {
      health = 100;
    } else {
      health = Math.round(100 - total * 0.5);
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
  const where = {};
  if (content) where.content = content;
  if (start || end) {
    where.time = {};
    if (start) where.time.gte = new Date(start);
    if (end) where.time.lte = new Date(end);
  }
  try {
    const history = await prisma.warningHistory.findMany({
      where,
      orderBy: { time: 'desc' },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alert', async (req, res) => {
  try {
    const {
      cameraId, timestamp, alarmType, level, value, code, worker,
      carNumber, line, station, direction, location, mileage, speed,
      imageUrl, videoUrl
    } = req.body;

    const data = {
      code: code || 'UNKNOWN',
      content: alarmType || '未知告警',
      time: new Date(timestamp),
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

    const created = await prisma.warningHistory.create({ data });

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

    currentWarningList.push(newWarning);

    const counts = {};
    currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
    currentOverLimit = currentOverLimit.map(card => ({
      ...card,
      count: counts[card.title] || 0,
    }));

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

    const counts = {};
    currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
    currentOverLimit = currentOverLimit.map(card => ({
      ...card,
      count: counts[card.title] || 0,
    }));

    broadcastFullUpdate();
    console.log('📡 已广播更新');

    res.json({ success: true, message: '记录已删除' });
  } catch (err) {
    console.error('❌ 删除失败详情:', err);
    console.error(err.stack);
    res.status(500).json({ error: err.message || '删除失败，请查看后端日志' });
  }
});

// ============================================================
// 2. 文件上传模块（保存到 D:/uploads）
// ============================================================

// 修改上传目录为 D:/uploads
const uploadDir = 'D:/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 已创建上传目录: ${uploadDir}`);
}

// 配置 multer 存储
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
    limits: { fileSize: 50 * 1024 * 1024 } // 限制 50MB
});

// 上传文件（图片/视频）
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
    }
    // 返回可访问的 URL（注意：URL 路径仍以 /uploads 开头，但实际文件在 D:/uploads）
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
});

// 提供静态文件服务（让前端能访问 D:/uploads 中的文件）
app.use('/uploads', express.static(uploadDir));

// ============================================================
// 3. 数据采集模块（支持真实PLC和模拟模式）
// ============================================================

// ---------- 配置（支持环境变量） ----------
const PLC_CONFIG = {
    host: process.env.PLC_HOST || '192.168.1.88',
    port: parseInt(process.env.PLC_PORT) || 502,
    unitId: parseInt(process.env.PLC_UNIT_ID) || 1,
    registers: {
        temperature: parseInt(process.env.PLC_REG_TEMP) || 30001,
        pressure: parseInt(process.env.PLC_REG_PRESS) || 30002,
        humidity: parseInt(process.env.PLC_REG_HUMID) || 30003
    },
    readInterval: parseInt(process.env.PLC_INTERVAL) || 2000,
    windowSize: parseInt(process.env.PLC_WINDOW) || 10
};

let SIMULATION_MODE = process.env.PLC_MODE === 'simulation';
let plcClient = null;
let sensorBuffer = [];
let isPLCConnecting = false;
let realInterval = null;
let simulationInterval = null;

// ===== 暂停模拟状态 =====
let isSimulationPaused = false;

// ---------- 故障分析逻辑 ----------
function analyzeFault(data) {
    const faults = [];

    if (data.temperature > 80) {
        faults.push({
            type: '高温预警',
            level: 'warning',
            value: data.temperature,
            detail: `均值温度 ${data.temperature}°C > 80°C`
        });
    } else if (data.temperature < -10) {
        faults.push({
            type: '低温预警',
            level: 'warning',
            value: data.temperature,
            detail: `均值温度 ${data.temperature}°C < -10°C`
        });
    }

    if (data.pressure > 1000) {
        faults.push({
            type: '高压报警',
            level: 'error',
            value: data.pressure,
            detail: `均值压力 ${data.pressure}kPa > 1000kPa`
        });
    } else if (data.pressure < 100) {
        faults.push({
            type: '低压报警',
            level: 'error',
            value: data.pressure,
            detail: `均值压力 ${data.pressure}kPa < 100kPa`
        });
    }

    if (data.humidity > 85) {
        faults.push({
            type: '高湿预警',
            level: 'warning',
            value: data.humidity,
            detail: `均值湿度 ${data.humidity}% > 85%`
        });
    }

    return faults;
}

// ---------- 广播传感器数据 ----------
function broadcastSensorData(avg, faults) {
    const payload = {
        timestamp: new Date().toISOString(),
        temperature: avg.temperature,
        pressure: avg.pressure,
        humidity: avg.humidity,
        faults: faults,
        type: faults.length > 0 ? 'alarm' : 'normal'
    };
    io.emit('sensorData', payload);
    return payload;
}

// ---------- 处理告警存储 ----------
async function handleAlarm(faults, avg) {
    for (const fault of faults) {
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
        currentWarningList.push(memWarning);
    }

    const counts = {};
    currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
    currentOverLimit = currentOverLimit.map(card => ({
        ...card,
        count: counts[card.title] || 0,
    }));
    broadcastFullUpdate();
}

// ---------- 真实 PLC 采集逻辑 ----------
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
        plcClient = await connectPLC();
        if (!plcClient) {
            if (!SIMULATION_MODE) {
                console.warn('⚠️ 自动切换到模拟模式');
                SIMULATION_MODE = true;
                startSimulation();
            }
            return;
        }
    }

    try {
        const tempData = await plcClient.readHoldingRegisters(PLC_CONFIG.registers.temperature, 1);
        const temp = tempData.data[0] / 10;
        const pressData = await plcClient.readHoldingRegisters(PLC_CONFIG.registers.pressure, 1);
        const pressure = pressData.data[0] / 100;
        const humidData = await plcClient.readHoldingRegisters(PLC_CONFIG.registers.humidity, 1);
        const humidity = humidData.data[0] / 10;

        const record = {
            timestamp: Date.now(),
            temperature: Math.round(temp * 10) / 10,
            pressure: Math.round(pressure * 100) / 100,
            humidity: Math.round(humidity * 10) / 10
        };
        sensorBuffer.push(record);
        console.log(`📥 缓存第 ${sensorBuffer.length}/${PLC_CONFIG.windowSize} 条`);

        if (sensorBuffer.length >= PLC_CONFIG.windowSize) {
            await processBuffer();
        }
    } catch (err) {
        console.error('❌ 读取传感器数据失败:', err.message);
        plcClient = null;
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
    const faults = analyzeFault(avg);
    broadcastSensorData(avg, faults);
    if (faults.length > 0) {
        await handleAlarm(faults, avg);
        console.log(`🚨 检测到 ${faults.length} 个故障`);
    } else {
        console.log('✅ 数据正常');
    }
    sensorBuffer = [];
}

// ---------- 模拟模式（支持暂停） ----------
function startSimulation() {
    if (simulationInterval) return;
    if (realInterval) {
        clearInterval(realInterval);
        realInterval = null;
    }
    console.log('🔄 模拟模式已启动，将生成随机传感器数据');
    simulationInterval = setInterval(() => {
        if (isSimulationPaused) return;
        // 生成随机数据
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
        const faults = analyzeFault(avg);
        broadcastSensorData(avg, faults);
        if (faults.length > 0) {
            handleAlarm(faults, avg).catch(console.error);
            console.log(`🚨 [模拟] 检测到 ${faults.length} 个故障`);
        } else {
            console.log(`📊 [模拟] 温度 ${avg.temperature}°C, 压力 ${avg.pressure}kPa, 湿度 ${avg.humidity}%`);
        }
    }, PLC_CONFIG.readInterval);
}

// ---------- 启动真实采集 ----------
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

// ---------- API 接口：查询和切换模式 ----------
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

// ===== 暂停模拟 API =====
app.get('/api/simulation/pause', (req, res) => {
    res.json({ paused: isSimulationPaused });
});

app.post('/api/simulation/pause', (req, res) => {
    isSimulationPaused = !isSimulationPaused;
    console.log(`⏸️ 模拟数据${isSimulationPaused ? '已暂停' : '已恢复'}`);
    res.json({ paused: isSimulationPaused });
});

// ============================================================
// 4. 清除模拟数据 API
// ============================================================
app.delete('/api/simulation/clear', async (req, res) => {
    try {
        const deleted = await prisma.warningHistory.deleteMany({
            where: {
                code: 'PLC_SENSOR'
            }
        });
        const before = currentWarningList.length;
        currentWarningList = currentWarningList.filter(w => w.code !== 'PLC_SENSOR');
        const removed = before - currentWarningList.length;

        const counts = {};
        currentWarningList.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1; });
        currentOverLimit = currentOverLimit.map(card => ({
            ...card,
            count: counts[card.title] || 0,
        }));

        broadcastFullUpdate();
        console.log(`🧹 已清除 ${deleted.count} 条模拟告警记录（内存移除 ${removed} 条）`);
        res.json({ success: true, dbCount: deleted.count, memRemoved: removed });
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
})();