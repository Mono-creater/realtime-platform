<template>
  <div class="monitor-car">
    <!-- ===== 顶部状态栏 ===== -->
    <div class="header">
      <div class="title">
        <span class="icon">📊</span>  环境参数
        <span class="status" :class="statusClass">{{ statusText }}</span>
        <el-button
          size="small"
          :type="mode === 'simulation' ? 'warning' : 'primary'"
          @click="toggleMode"
          :loading="modeLoading"
          style="margin-left: 12px;"
        >
          {{ mode === 'simulation' ? '🔁 模拟模式' : '🔌 真实模式' }}
        </el-button>
        <el-button
          v-if="mode === 'simulation'"
          size="small"
          :type="simulationPaused ? 'success' : 'info'"
          @click="togglePause"
          :loading="pauseLoading"
          style="margin-left: 8px;"
        >
          {{ simulationPaused ? '▶️ 继续' : '⏸️ 暂停' }}
        </el-button>
      </div>
      <div class="time">{{ currentTime }}</div>
    </div>

    <!-- ===== 主体：左右两列 ===== -->
    <el-row :gutter="20" class="main-row">
      <!-- 左侧：传感器数据 + 趋势图 -->
      <el-col :span="14">
        <el-card class="sensor-card" shadow="never">
          <template #header>
            <span>实时传感器数据</span>
            <span style="float:right;font-size:13px;color:#7a8b9f;">
              最近 {{ trendData.length }} 个数据点
            </span>
          </template>
          <!-- 三个传感器卡片 -->
          <el-row :gutter="20">
            <el-col :span="8" v-for="sensor in sensors" :key="sensor.name">
              <div class="sensor-item">
                <div class="sensor-label">{{ sensor.label }}</div>
                <div class="sensor-value" :style="{ color: sensor.color }">
                  {{ sensor.value }} <span class="unit">{{ sensor.unit }}</span>
                </div>
                <div class="sensor-bar">
                  <el-progress
                    :percentage="sensor.percent"
                    :color="sensor.color"
                    :stroke-width="8"
                    :show-text="false"
                  />
                </div>
                <div class="sensor-range">
                  <span>低</span>
                  <span>高</span>
                </div>
              </div>
            </el-col>
          </el-row>
          <!-- 实时趋势折线图 -->
          <div ref="trendChartRef" class="trend-chart"></div>
        </el-card>
      </el-col>

      <!-- 右侧：受电弓动态图 + 自动调节按钮 -->
      <el-col :span="10">
        <el-card class="pantograph-card" shadow="never">
          <template #header>
            <span>受电弓状态</span>
            <el-button
              size="small"
              type="success"
              :loading="autoAdjustLoading"
              @click="toggleAutoAdjust"
              style="float:right;"
            >
              {{ autoAdjustEnabled ? '⏹️ 停止调节' : '⚙️ 自动调节' }}
            </el-button>
          </template>
          <div class="pantograph-container">
            <svg viewBox="0 0 300 200" class="pantograph-svg">
              <!-- 受电弓底座 -->
              <rect x="120" y="160" width="60" height="20" fill="#555" rx="4" />
              <!-- 下臂 -->
              <line :x1="140" :y1="160" :x2="100" :y2="pantographY" stroke="#ccc" stroke-width="6" stroke-linecap="round" />
              <line :x1="160" :y1="160" :x2="200" :y2="pantographY" stroke="#ccc" stroke-width="6" stroke-linecap="round" />
              <!-- 上臂 -->
              <line :x1="100" :y1="pantographY" :x2="60" :y2="pantographY-30" stroke="#ddd" stroke-width="5" stroke-linecap="round" />
              <line :x1="200" :y1="pantographY" :x2="240" :y2="pantographY-30" stroke="#ddd" stroke-width="5" stroke-linecap="round" />
              <!-- 弓头（滑板） -->
              <rect x="50" y="pantographY-40" width="200" height="12" rx="6" fill="#f0c040" stroke="#c90" stroke-width="2" />
              <!-- 接触线（示意） -->
              <line x1="0" y1="pantographY-45" x2="300" y2="pantographY-45" stroke="#aaa" stroke-width="2" stroke-dasharray="8,4" />
              <!-- 标签 -->
              <text x="10" y="20" fill="#b0c4de" font-size="12">弓头高度</text>
              <text x="10" y="35" fill="#b0c4de" font-size="12">{{ pantographHeight }}%</text>
            </svg>
            <div class="pantograph-status">
              <span>当前高度: {{ pantographHeight }}%</span>
              <span>压力: {{ currentPressure }} kPa</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 底部：PID 参数实时显示 ===== -->
    <el-row :gutter="20" class="bottom-row">
      <el-col :span="24">
        <el-card class="pid-card" shadow="never">
          <template #header>
            <span>PID 参数调节（根据温湿度/压力实时调整）</span>
          </template>
          <el-row :gutter="30">
            <el-col :span="6">
              <div class="pid-item">
                <label>Kp (比例)</label>
                <el-input-number v-model="pidParams.Kp" :min="0" :max="100" :step="0.1" size="small" @change="onPidChange" />
                <span class="pid-value">{{ pidParams.Kp.toFixed(2) }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>Ki (积分)</label>
                <el-input-number v-model="pidParams.Ki" :min="0" :max="10" :step="0.05" size="small" @change="onPidChange" />
                <span class="pid-value">{{ pidParams.Ki.toFixed(2) }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>Kd (微分)</label>
                <el-input-number v-model="pidParams.Kd" :min="0" :max="5" :step="0.05" size="small" @change="onPidChange" />
                <span class="pid-value">{{ pidParams.Kd.toFixed(2) }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>目标值</label>
                <el-input-number v-model="pidParams.target" :min="0" :max="100" :step="1" size="small" @change="onPidChange" />
                <span class="pid-value">{{ pidParams.target }}</span>
              </div>
            </el-col>
          </el-row>
          <div class="pid-status">
            <span>当前输入: {{ currentInput }}</span>
            <span>输出: {{ pidOutput }}</span>
            <span>状态: {{ pidStatus }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'
import socket from '@/socket'
import { ElMessage } from 'element-plus'

// ---------- 状态 ----------
const currentTime = ref('')
const statusText = ref('连接中')
const statusClass = ref('connecting')

// 模式状态
const mode = ref('real')
const modeLoading = ref(false)
const simulationPaused = ref(false)
const pauseLoading = ref(false)

// 自动调节
const autoAdjustEnabled = ref(false)
const autoAdjustLoading = ref(false)

// 传感器数据
const sensors = ref([
  { name: 'temperature', label: '温度', value: 0, unit: '°C', color: '#00d68f', percent: 0 },
  { name: 'pressure',    label: '压力', value: 0, unit: 'kPa', color: '#ffaa00', percent: 0 },
  { name: 'humidity',    label: '湿度', value: 0, unit: '%',   color: '#2ca7e0', percent: 0 }
])

// 趋势数据
const trendData = ref([])

// 图表实例
const trendChartRef = ref(null)
let trendChart = null

// 受电弓动态参数
const pantographY = ref(120) // 弓头Y坐标
const pantographHeight = ref(50) // 0-100%
const currentPressure = ref(0)

// PID 参数
const pidParams = ref({
  Kp: 2.0,
  Ki: 0.5,
  Kd: 0.1,
  target: 60 // 目标压力 (kPa)
})
const currentInput = ref(0)
const pidOutput = ref(0)
const pidStatus = ref('待机')

// ---------- 辅助函数 ----------
function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', { hour12: false })
}

// 更新传感器显示及百分比
function updateSensors(data) {
  sensors.value.forEach(s => {
    const val = data[s.name]
    if (val !== undefined && val !== null) {
      s.value = typeof val === 'number' ? val.toFixed(1) : val
      let percent = 0
      if (s.name === 'temperature') {
        percent = ((val + 20) / 120) * 100
      } else if (s.name === 'pressure') {
        percent = (val / 1200) * 100
      } else if (s.name === 'humidity') {
        percent = val
      }
      s.percent = Math.min(100, Math.max(0, Math.round(percent)))
    }
  })
}

// 更新受电弓状态（根据压力）
function updatePantograph(pressure) {
  currentPressure.value = pressure
  // 压力映射到弓头高度（0-100%），压力越大弓头越低（假设压力大表示降弓）
  const minPressure = 100, maxPressure = 1000
  const clamped = Math.min(maxPressure, Math.max(minPressure, pressure))
  const heightPercent = 100 - ((clamped - minPressure) / (maxPressure - minPressure)) * 100
  pantographHeight.value = Math.round(heightPercent)
  // 计算 Y 坐标：范围 80~150
  const yMin = 150, yMax = 80
  pantographY.value = yMin - (heightPercent / 100) * (yMin - yMax)
}

// 更新趋势图
function updateTrendChart() {
  if (!trendChart) return
  const dates = trendData.value.map(d => d.timestamp.slice(11, 19))
  const temps = trendData.value.map(d => d.temperature)
  const pressures = trendData.value.map(d => d.pressure)
  const humidities = trendData.value.map(d => d.humidity)

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '压力', '湿度'], textStyle: { color: '#b0c4de' } },
    grid: { left: '3%', right: '3%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#b0c4de', rotate: 30 },
      boundaryGap: false
    },
    yAxis: [
      { type: 'value', name: '温度(°C)', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#b0c4de' } },
      { type: 'value', name: '压力(kPa)', splitLine: { show: false }, axisLabel: { color: '#b0c4de' } },
      { type: 'value', name: '湿度(%)', splitLine: { show: false }, axisLabel: { color: '#b0c4de' } }
    ],
    series: [
      { name: '温度', type: 'line', data: temps, smooth: true, lineStyle: { color: '#00d68f' }, yAxisIndex: 0 },
      { name: '压力', type: 'line', data: pressures, smooth: true, lineStyle: { color: '#ffaa00' }, yAxisIndex: 1 },
      { name: '湿度', type: 'line', data: humidities, smooth: true, lineStyle: { color: '#2ca7e0' }, yAxisIndex: 2 }
    ]
  }
  trendChart.setOption(option, true)
  trendChart.resize()
}

// ---------- PID 逻辑 ----------
function computePID(input) {
  // 模拟 PID 计算：这里简单演示，实际可根据真实算法
  const error = pidParams.value.target - input
  // 比例项
  const p = pidParams.value.Kp * error
  // 积分项（累积，此处简化）
  const i = pidParams.value.Ki * error * 0.1
  // 微分项（变化率，简化）
  const d = pidParams.value.Kd * (error - (this._lastError || 0)) * 0.1
  this._lastError = error
  let output = p + i + d
  // 限幅
  output = Math.min(100, Math.max(0, output))
  return { output, p, i, d }
}

// 处理传感器数据（核心实时更新）
function handleSensorData(data) {
  // 1. 更新传感器数值
  updateSensors(data)

  // 2. 更新受电弓
  if (data.pressure !== undefined) {
    updatePantograph(data.pressure)
  }

  // 3. 更新 PID
  const input = data.pressure || 0
  currentInput.value = input
  const result = computePID(input)
  pidOutput.value = Math.round(result.output)
  pidStatus.value = Math.abs(result.output - pidParams.value.target) < 2 ? '稳定' : '调节中'

  // 4. 追加趋势数据
  if (data.timestamp && data.temperature !== undefined) {
    const item = {
      timestamp: data.timestamp,
      temperature: data.temperature,
      pressure: data.pressure,
      humidity: data.humidity
    }
    trendData.value.push(item)
    if (trendData.value.length > 50) trendData.value.shift()
    nextTick(() => updateTrendChart())
  }
}

// ---------- 自动调节功能 ----------
function toggleAutoAdjust() {
  autoAdjustLoading.value = true
  setTimeout(() => {
    autoAdjustEnabled.value = !autoAdjustEnabled.value
    autoAdjustLoading.value = false
    ElMessage.success(autoAdjustEnabled.value ? '自动调节已开启' : '自动调节已停止')
    if (autoAdjustEnabled.value) {
      // 模拟自动调节：每秒根据当前输入调整目标值
      if (window._autoAdjustInterval) clearInterval(window._autoAdjustInterval)
      window._autoAdjustInterval = setInterval(() => {
        if (!autoAdjustEnabled.value) return
        // 根据当前压力调整目标值（示例逻辑）
        const current = currentInput.value
        if (current < 300) {
          pidParams.value.target = Math.min(80, pidParams.value.target + 1)
        } else if (current > 600) {
          pidParams.value.target = Math.max(40, pidParams.value.target - 1)
        }
        // 界面更新
        onPidChange()
      }, 1000)
    } else {
      if (window._autoAdjustInterval) {
        clearInterval(window._autoAdjustInterval)
        window._autoAdjustInterval = null
      }
    }
  }, 300)
}

// PID 参数变化时触发
function onPidChange() {
  // 可以在这里更新 PID 控制器的参数（例如发送到后端）
  console.log('PID params changed:', pidParams.value)
  // 如需与后端联动，可发送 WebSocket 消息
}

// ---------- 模式切换 ----------
async function fetchMode() {
  try {
    const res = await axios.get('/api/plc/mode')
    mode.value = res.data.mode || 'real'
  } catch { mode.value = 'real' }
}

async function toggleMode() {
  const target = mode.value === 'simulation' ? 'real' : 'simulation'
  modeLoading.value = true
  try {
    const res = await axios.post('/api/plc/mode', { mode: target })
    mode.value = res.data.mode
    ElMessage.success(`已切换到 ${mode.value === 'simulation' ? '模拟' : '真实'} 模式`)
    if (mode.value === 'simulation') {
      await fetchPauseStatus()
    } else {
      simulationPaused.value = false
    }
  } catch (err) {
    ElMessage.error('切换模式失败: ' + (err.response?.data?.error || err.message))
  } finally {
    modeLoading.value = false
  }
}

async function fetchPauseStatus() {
  if (mode.value !== 'simulation') return
  try {
    const res = await axios.get('/api/simulation/pause')
    simulationPaused.value = res.data.paused
  } catch (err) {
    console.warn('获取暂停状态失败', err)
  }
}

async function togglePause() {
  pauseLoading.value = true
  try {
    const res = await axios.post('/api/simulation/pause')
    simulationPaused.value = res.data.paused
    ElMessage.success(`模拟数据已${simulationPaused.value ? '暂停' : '恢复'}`)
  } catch (err) {
    ElMessage.error('切换暂停状态失败: ' + (err.response?.data?.error || err.message))
  } finally {
    pauseLoading.value = false
  }
}

// ---------- 图表初始化 ----------
function initTrendChart() {
  if (!trendChartRef.value) return
  if (trendChart) trendChart.dispose()
  trendChart = echarts.init(trendChartRef.value, 'dark')
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '压力', '湿度'], textStyle: { color: '#b0c4de' } },
    grid: { left: '3%', right: '3%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLabel: { color: '#b0c4de' } },
    yAxis: [
      { type: 'value', name: '温度(°C)', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#b0c4de' } },
      { type: 'value', name: '压力(kPa)', splitLine: { show: false }, axisLabel: { color: '#b0c4de' } },
      { type: 'value', name: '湿度(%)', splitLine: { show: false }, axisLabel: { color: '#b0c4de' } }
    ],
    series: [
      { name: '温度', type: 'line', data: [], smooth: true, lineStyle: { color: '#00d68f' }, yAxisIndex: 0 },
      { name: '压力', type: 'line', data: [], smooth: true, lineStyle: { color: '#ffaa00' }, yAxisIndex: 1 },
      { name: '湿度', type: 'line', data: [], smooth: true, lineStyle: { color: '#2ca7e0' }, yAxisIndex: 2 }
    ]
  }
  trendChart.setOption(option)
  trendChart.resize()
}

// ---------- WebSocket 连接状态 ----------
function handleConnect() {
  statusText.value = '已连接'
  statusClass.value = 'normal'
}

function handleDisconnect() {
  statusText.value = '断开连接'
  statusClass.value = 'disconnected'
}

// ---------- 生命周期 ----------
onMounted(async () => {
  updateTime()
  setInterval(updateTime, 1000)

  socket.on('sensorData', handleSensorData)
  socket.on('connect', handleConnect)
  socket.on('disconnect', handleDisconnect)

  await fetchMode()
  if (mode.value === 'simulation') {
    await fetchPauseStatus()
  }

  await nextTick()
  initTrendChart()

  // 窗口自适应
  window.addEventListener('resize', () => {
    trendChart?.resize()
  })
})

onUnmounted(() => {
  socket.off('sensorData', handleSensorData)
  socket.off('connect', handleConnect)
  socket.off('disconnect', handleDisconnect)
  trendChart?.dispose()
  if (window._autoAdjustInterval) {
    clearInterval(window._autoAdjustInterval)
    window._autoAdjustInterval = null
  }
  window.removeEventListener('resize', () => {})
})
</script>

<style scoped>
/* ===== 整体 ===== */
.monitor-car {
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  background: radial-gradient(ellipse at 50% 0%, rgba(0, 198, 255, 0.05) 0%, transparent 70%);
  overflow-y: auto;
  color: #fff;
}

/* ===== 顶部 ===== */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.title {
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.title .icon { font-size: 26px; }
.status {
  font-size: 14px;
  font-weight: 400;
  padding: 2px 12px;
  border-radius: 20px;
  background: rgba(255,255,255,0.1);
}
.status.connecting { color: #ffaa00; }
.status.normal { color: #00d68f; }
.status.alert { color: #ff3d71; animation: blink 1s infinite; }
.status.disconnected { color: #ff3d71; }
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.time {
  font-size: 16px;
  color: #b0c4de;
}

/* ===== 卡片 ===== */
.el-card {
  background: rgba(255,255,255,0.03) !important;
  border: 1px solid rgba(255,255,255,0.06) !important;
  border-radius: 16px !important;
  backdrop-filter: blur(4px);
  color: #fff;
}
.el-card :deep(.el-card__header) {
  border-bottom: 1px solid rgba(255,255,255,0.06);
  color: #b0c4de;
  font-size: 16px;
  font-weight: 500;
}
.el-card :deep(.el-card__body) {
  padding: 20px;
}

/* ===== 传感器 ===== */
.sensor-item {
  text-align: center;
  padding: 10px 0;
}
.sensor-label {
  font-size: 14px;
  color: #b0c4de;
  margin-bottom: 6px;
}
.sensor-value {
  font-size: 28px;
  font-weight: 600;
}
.sensor-value .unit {
  font-size: 16px;
  font-weight: 400;
  color: #b0c4de;
  margin-left: 4px;
}
.sensor-bar {
  margin: 8px 0 4px;
}
.sensor-range {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #7a8b9f;
}
.trend-chart {
  width: 100%;
  height: 170px;
  margin-top: 8px;
}

/* ===== 受电弓 ===== */
.pantograph-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pantograph-svg {
  width: 100%;
  max-width: 300px;
  height: auto;
  background: rgba(0,0,0,0.2);
  border-radius: 12px;
}
.pantograph-status {
  display: flex;
  justify-content: space-around;
  width: 100%;
  margin-top: 10px;
  color: #b0c4de;
  font-size: 14px;
}

/* ===== PID ===== */
.pid-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pid-item label {
  color: #b0c4de;
  min-width: 50px;
  font-size: 14px;
}
.pid-item .pid-value {
  color: #00c6ff;
  font-weight: bold;
  min-width: 50px;
}
.pid-status {
  margin-top: 12px;
  display: flex;
  gap: 30px;
  color: #b0c4de;
  font-size: 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 12px;
}
.pid-status span {
  background: rgba(0,198,255,0.1);
  padding: 4px 12px;
  border-radius: 12px;
}

/* ===== 布局 ===== */
.main-row {
  margin-bottom: 20px;
}
.bottom-row {
  margin-top: 0;
}

/* ===== 滚动条 ===== */
.monitor-car::-webkit-scrollbar {
  width: 4px;
}
.monitor-car::-webkit-scrollbar-track {
  background: transparent;
}
.monitor-car::-webkit-scrollbar-thumb {
  background: rgba(0, 198, 255, 0.3);
  border-radius: 10px;
}
.monitor-car::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 198, 255, 0.6);
}
</style>