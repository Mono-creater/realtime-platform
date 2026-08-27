<template>
  <div class="monitor-car">
    <!-- ===== 顶部状态栏 ===== -->
    <div class="header">
      <div class="title">
        <span class="icon">📊</span>  环境参数
        <span class="status" :class="statusClass">{{ statusText }}</span>
        <!-- 数据源 + 报文信息 -->
        <span v-if="sourceText" class="source-tag" :class="'source-' + dataSource">{{ sourceText }}</span>
        <span v-if="packetSeq !== null" class="seq-tag">seq={{ packetSeq }}</span>
        <span v-if="subPacketTag" class="sub-tag">⚠️ {{ subPacketTag }}</span>
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
          <!-- 三个传感器卡片（异常红色高亮 + 子包异常值徽标） -->
          <el-row :gutter="20">
            <el-col :span="8" v-for="sensor in sensors" :key="sensor.name">
              <div class="sensor-item" :class="{ 'sensor-alarm': sensorAlarm[sensor.name] }">
                <div class="sensor-label">{{ sensor.label }}</div>
                <div class="sensor-value" :style="{ color: sensorAlarm[sensor.name] ? '#ff3d71' : sensor.color }">
                  {{ sensor.value }} <span class="unit">{{ sensor.unit }}</span>
                </div>
                <div v-if="sensorAlarm[sensor.name]" class="sensor-badge">
                  ⚠️ {{ sensorAlarm[sensor.name].type }}｜子包值 {{ sensorAlarm[sensor.name].value }}{{ sensor.unit }}
                </div>
                <div class="sensor-bar">
                  <el-progress
                    :percentage="sensor.percent"
                    :color="sensorAlarm[sensor.name] ? '#ff3d71' : sensor.color"
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

      <!-- 右侧：受电弓动态图（由姿态环测量高度驱动） -->
      <el-col :span="10">
        <el-card class="pantograph-card" shadow="never">
          <template #header>
            <span>受电弓状态</span>
            <el-switch
              v-model="postureParams.auto"
              active-text="自动"
              style="float:right;"
              @change="toggleAuto('posture', $event)"
            />
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
              <span>弓头高度: {{ fmtHeight }} mm</span>
              <span>接触力: {{ fmtForce }} N</span>
              <span>θ1={{ fmtTheta1 }}° θ2={{ fmtTheta2 }}°</span>
              <span>气囊压力: {{ fmtAirPress }} kPa</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 底部：双环 PID（后端控制引擎实时参数 + Z-N 整定） ===== -->
    <el-row :gutter="20" class="bottom-row">
      <el-col :span="12" v-for="loopDef in loopDefs" :key="loopDef.key">
        <el-card class="pid-card" shadow="never">
          <template #header>
            <span>{{ loopDef.title }}</span>
            <el-switch
              v-model="loopDef.params.auto"
              active-text="自动"
              style="float:right;"
              @change="toggleAuto(loopDef.key, $event)"
            />
          </template>
          <!-- 运行状态 -->
          <div class="pid-status">
            <span>目标: {{ loopDef.target.toFixed(loopDef.key === 'force' ? 0 : 0) }} {{ loopDef.targetUnit }}</span>
            <span>测量: {{ loopDef.measurement.toFixed(1) }} {{ loopDef.measureUnit }}</span>
            <span>输出: {{ loopDef.output.toFixed(0) }} {{ loopDef.outputUnit }}</span>
            <span :class="{ 'error-tag': Math.abs(loopDef.error) > loopDef.errorLimit }">
              误差: {{ loopDef.error.toFixed(1) }} {{ loopDef.measureUnit }}
            </span>
          </div>
          <!-- 参数 -->
          <el-row :gutter="16" class="pid-params">
            <el-col :span="6">
              <div class="pid-item">
                <label>Kp</label>
                <el-input-number v-model="loopDef.params.kp" :min="0" :max="100" :step="0.1" size="small" @change="onPidChange(loopDef.key)" />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>Ki</label>
                <el-input-number v-model="loopDef.params.ki" :min="0" :max="50" :step="0.05" size="small" @change="onPidChange(loopDef.key)" />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>Kd</label>
                <el-input-number v-model="loopDef.params.kd" :min="0" :max="50" :step="0.05" size="small" @change="onPidChange(loopDef.key)" />
              </div>
            </el-col>
            <el-col :span="6">
              <div class="pid-item">
                <label>目标</label>
                <el-input-number v-model="loopDef.params.target" :min="0" :max="loopDef.key === 'force' ? 1000 : 2600" :step="1" size="small" @change="onPidChange(loopDef.key)" />
              </div>
            </el-col>
          </el-row>
          <!-- Z-N 整定 -->
          <div class="tune-row">
            <el-button
              size="small"
              type="primary"
              :disabled="tuneBusy !== null && tuneBusy !== loopDef.key"
              :loading="tuneLoading && tuneBusy === loopDef.key"
              @click="startTune(loopDef.key)"
            >
              📈 Z-N 整定
            </el-button>
            <template v-if="tuneInfo && tuneInfo.loop === loopDef.key">
              <el-button
                v-if="tuneInfo.state === 'sampling'"
                size="small"
                type="danger"
                @click="cancelTune"
              >
                🛑 取消
              </el-button>
              <el-progress
                v-if="tuneInfo.state === 'sampling'"
                :percentage="tuneInfo.progressPct"
                :stroke-width="6"
                class="tune-progress"
              />
              <span v-if="tuneInfo.state === 'done' && tuneInfo.result" class="tune-result">
                ✅ K={{ tuneInfo.result.K.toFixed(3) }} T={{ tuneInfo.result.T.toFixed(1) }}s L={{ tuneInfo.result.L.toFixed(1) }}s
                → Kp={{ tuneInfo.result.kp.toFixed(2) }} Ki={{ tuneInfo.result.ki.toFixed(2) }} Kd={{ tuneInfo.result.kd.toFixed(2) }}
              </span>
              <span v-if="tuneInfo.state === 'failed'" class="tune-failed">❌ {{ tuneInfo.error }}</span>
              <span v-if="tuneInfo.state === 'cancelled'" class="tune-failed">整定已取消</span>
            </template>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 公式与文献脚注 -->
    <div class="footnote">
      公式依据：Ziegler-Nichols 阶跃整定（Trans. ASME 64:759-768, 1942）· 接触力-气囊力平衡（EN 50367:2012，静态接触力 70-120N）·
      位置式并联 PID 微分先行（Åström & Hägglund, PID Controllers, ISA 1995）· 两连杆正运动学（Craig, Introduction to Robotics）
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import echarts from '@/utils/echarts'
import api from '@/utils/api'
import socket from '@/socket'

// ---------- 状态 ----------
const currentTime = ref('')
const statusText = ref('连接中')
const statusClass = ref('connecting')

// 模式状态
const mode = ref('real')
const modeLoading = ref(false)
const simulationPaused = ref(false)
const pauseLoading = ref(false)

// 传感器数据
const sensors = ref([
  { name: 'temperature', label: '温度', value: 0, unit: '°C', color: '#00d68f', percent: 0 },
  { name: 'pressure',    label: '压力', value: 0, unit: 'kPa', color: '#ffaa00', percent: 0 },
  { name: 'humidity',    label: '湿度', value: 0, unit: '%',   color: '#2ca7e0', percent: 0 }
])
const sensorAlarm = ref({}) // {temperature: 异常对象, pressure: ..., humidity: ...}

// 报文信息（数据源 / 序号 / 子包）
const dataSource = ref('')
const packetSeq = ref(null)
const subPacketTag = ref('')
const sourceText = computed(() => {
  if (dataSource.value === 'plc') return 'PLC 实时数据'
  if (dataSource.value === 'fallback') return 'PLC（旧固件回退）'
  if (dataSource.value === 'simulation') return '模拟数据'
  return ''
})

// 趋势数据
const trendData = ref([])

// 图表实例
const trendChartRef = ref(null)
let trendChart = null

// 控制引擎状态（后端广播 data.control）
const control = ref(null)

// 双环可编辑参数（防抖提交到后端；广播仅在闲置时回写，避免打断输入）
const forceParams = ref({ kp: 1.5, ki: 0.5, kd: 0.5, target: 100, auto: false })
const postureParams = ref({ kp: 0.3, ki: 0.12, kd: 0.05, target: 2400, auto: false })
let lastEditAt = 0

const loopDefs = computed(() => {
  const c = control.value
  return [
    {
      key: 'force', title: '🔧 接触力环（气囊压力 → 接触力）',
      params: forceParams.value, targetUnit: 'N', measureUnit: 'N', outputUnit: 'kPa', errorLimit: 5,
      target: forceParams.value.target,
      measurement: c ? c.loops.force.measurement : 0,
      output: c ? c.loops.force.output : 0,
      error: c ? c.loops.force.error : 0
    },
    {
      key: 'posture', title: '🎯 姿态环（弓头高度）',
      params: postureParams.value, targetUnit: 'mm', measureUnit: 'mm', outputUnit: 'mm', errorLimit: 10,
      target: postureParams.value.target,
      measurement: c ? c.loops.posture.measurement : 0,
      output: c ? c.loops.posture.output : 0,
      error: c ? c.loops.posture.error : 0
    }
  ]
})

const tuneInfo = computed(() => (control.value && control.value.tune) || null)
const tuneBusy = computed(() => {
  if (!tuneInfo.value || (tuneInfo.value.state !== 'sampling')) return null
  return tuneInfo.value.loop
})
const tuneLoading = ref(false)

// 受电弓动态参数
const pantographY = ref(120) // 弓头Y坐标
const pantographHeight = ref(50) // 0-100%
const fmtHeight = computed(() => control.value ? Math.round(control.value.computed.height) : '—')
const fmtForce = computed(() => control.value ? control.value.computed.contactForce.toFixed(1) : '—')
const fmtTheta1 = computed(() => control.value ? control.value.computed.theta1.toFixed(1) : '—')
const fmtTheta2 = computed(() => control.value ? control.value.computed.theta2.toFixed(1) : '—')
const fmtAirPress = computed(() => control.value ? control.value.computed.airPressure.toFixed(1) : '—')

// ---------- 辅助函数 ----------
function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', { hour12: false })
}

// 异常类型 → 传感器名映射（子包位图与传感器卡对应）
const ANOMALY_TO_SENSOR = {
  '高温预警': 'temperature', '低温预警': 'temperature',
  '高压报警': 'pressure', '低压报警': 'pressure',
  '高湿预警': 'humidity'
}

// 更新传感器显示及百分比
function updateSensors(data) {
  // 异常映射（data.anomalies：后端已把子包位图解析为与告警同形的列表）
  const alarm = { temperature: null, pressure: null, humidity: null }
  for (const a of (data.anomalies || [])) {
    const name = ANOMALY_TO_SENSOR[a.type]
    if (name) alarm[name] = a
  }
  sensorAlarm.value = alarm

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

// 更新受电弓（姿态环测量高度 mm → 0-100%，行程 1000-2600mm）
function updatePantograph(heightMm) {
  const minH = 1000, maxH = 2600
  const clamped = Math.min(maxH, Math.max(minH, heightMm))
  const percent = ((clamped - minH) / (maxH - minH)) * 100
  pantographHeight.value = Math.round(percent)
  // 计算 Y 坐标：范围 80~150
  const yMin = 150, yMax = 80
  pantographY.value = yMin - (percent / 100) * (yMin - yMax)
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

// ---------- 双环 PID 交互（后端控制引擎） ----------
// 广播带 control 状态：仅当用户最近 3s 内未编辑参数时回写本地（避免打断输入）
function syncControlToParams() {
  const c = control.value
  if (!c || Date.now() - lastEditAt < 3000) return
  for (const [key, target] of [['force', forceParams], ['posture', postureParams]]) {
    const l = c.loops[key]
    target.value = { kp: l.kp, ki: l.ki, kd: l.kd, target: l.target, auto: l.auto }
  }
}

const paramTimers = {}
function onPidChange(loop) {
  lastEditAt = Date.now()
  if (paramTimers[loop]) clearTimeout(paramTimers[loop])
  paramTimers[loop] = setTimeout(async () => {
    const p = loop === 'force' ? forceParams.value : postureParams.value
    try {
      const res = await api.post('/api/control/params', {
        loop, kp: p.kp, ki: p.ki, kd: p.kd, target: p.target
      })
      applyControl(res.data.status)
      ElMessage.success(`PID 参数已更新 [${loop === 'force' ? '接触力环' : '姿态环'}]`)
    } catch (err) {
      ElMessage.error('参数更新失败: ' + (err.response?.data?.error || err.message))
      await refreshControl()
    }
  }, 300)
}

function applyControl(status) {
  if (!status) return
  control.value = status
  lastEditAt = 0
  syncControlToParams()
}

async function refreshControl() {
  try {
    const res = await api.get('/api/control/status')
    control.value = res.data
    lastEditAt = 0
    syncControlToParams()
  } catch (err) {
    console.warn('获取控制状态失败', err)
  }
}

async function toggleAuto(loop, enabled) {
  // el-switch 的 @change 直接传开关目标值（v-model 已先翻转本地值）
  try {
    const res = await api.post('/api/control/auto', { loop, enabled })
    applyControl(res.data.status)
    ElMessage.success(`${loop === 'force' ? '接触力环' : '姿态环'}自动调节${enabled ? '已开启' : '已停止'}`)
  } catch (err) {
    ElMessage.error('切换自动调节失败: ' + (err.response?.data?.error || err.message))
    await refreshControl()
  }
}

async function startTune(loop) {
  tuneLoading.value = true
  try {
    const res = await api.post('/api/control/tune', { loop })
    applyControl(res.data.status)
    ElMessage.info(`Z-N 整定已开始 [${loop === 'force' ? '接触力环' : '姿态环'}]，阶跃 Δu=${res.data.stepDelta}，请等待响应稳定`)
  } catch (err) {
    ElMessage.error('整定启动失败: ' + (err.response?.data?.error || err.message))
  } finally {
    tuneLoading.value = false
  }
}

async function cancelTune() {
  try {
    const res = await api.post('/api/control/tune/cancel')
    applyControl(res.data.status)
    ElMessage.warning('整定已取消')
  } catch (err) {
    ElMessage.error('取消失败: ' + (err.response?.data?.error || err.message))
  }
}

// ---------- 处理传感器数据（核心实时更新） ----------
function handleSensorData(data) {
  // 1. 更新传感器数值 + 异常映射
  updateSensors(data)

  // 2. 报文信息（数据源 / 序号 / 子包）
  dataSource.value = data.source || ''
  const pkt = data.packet
  packetSeq.value = pkt && pkt.main ? pkt.main.seq : null
  subPacketTag.value = pkt && pkt.sub ? `子包异常 #${pkt.sub.subSeq}` : ''

  // 3. 控制引擎状态 → 受电弓 + PID 参数回写
  if (data.control) {
    control.value = data.control
    const h = data.control.computed && data.control.computed.height
    if (h !== undefined) updatePantograph(h)
    syncControlToParams()
  }

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

// ---------- 模式切换 ----------
async function fetchMode() {
  try {
    const res = await api.get('/api/plc/mode')
    mode.value = res.data.mode || 'real'
  } catch { mode.value = 'real' }
}

async function toggleMode() {
  const target = mode.value === 'simulation' ? 'real' : 'simulation'
  modeLoading.value = true
  try {
    const res = await api.post('/api/plc/mode', { mode: target })
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
    const res = await api.get('/api/simulation/pause')
    simulationPaused.value = res.data.paused
  } catch (err) {
    console.warn('获取暂停状态失败', err)
  }
}

async function togglePause() {
  pauseLoading.value = true
  try {
    const res = await api.post('/api/simulation/pause')
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
let clockTimer = null
function handleResize() {
  trendChart?.resize()
}

onMounted(async () => {
  updateTime()
  clockTimer = setInterval(updateTime, 1000)

  socket.on('sensorData', handleSensorData)
  socket.on('connect', handleConnect)
  socket.on('disconnect', handleDisconnect)

  await fetchMode()
  if (mode.value === 'simulation') {
    await fetchPauseStatus()
  }
  await refreshControl()

  await nextTick()
  initTrendChart()

  // 窗口自适应
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  socket.off('sensorData', handleSensorData)
  socket.off('connect', handleConnect)
  socket.off('disconnect', handleDisconnect)
  trendChart?.dispose()
  if (clockTimer) clearInterval(clockTimer)
  for (const key of Object.keys(paramTimers)) clearTimeout(paramTimers[key])
  window.removeEventListener('resize', handleResize)
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

/* ===== 数据源 / 报文标签 ===== */
.source-tag, .seq-tag, .sub-tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  background: rgba(0, 198, 255, 0.12);
  color: #00c6ff;
}
.source-fallback { background: rgba(255, 170, 0, 0.15); color: #ffaa00; }
.source-simulation { background: rgba(44, 167, 224, 0.15); color: #2ca7e0; }
.seq-tag { background: rgba(255,255,255,0.08); color: #b0c4de; }
.sub-tag {
  background: rgba(255, 61, 113, 0.2);
  color: #ff3d71;
  animation: blink 1.2s infinite;
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
  border-radius: 12px;
  transition: all 0.3s;
}
.sensor-alarm {
  background: rgba(255, 61, 113, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 61, 113, 0.5);
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
.sensor-badge {
  margin-top: 4px;
  font-size: 12px;
  color: #ff3d71;
  background: rgba(255, 61, 113, 0.12);
  border-radius: 10px;
  padding: 2px 8px;
  display: inline-block;
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
  flex-wrap: wrap;
  justify-content: space-around;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
  color: #b0c4de;
  font-size: 14px;
}
.pantograph-status span {
  background: rgba(0,198,255,0.1);
  padding: 4px 12px;
  border-radius: 12px;
}

/* ===== PID 双环 ===== */
.pid-card {
  margin-bottom: 8px;
}
.pid-status {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  color: #b0c4de;
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.pid-status span {
  background: rgba(0,198,255,0.1);
  padding: 4px 12px;
  border-radius: 12px;
}
.pid-status .error-tag {
  background: rgba(255, 170, 0, 0.18);
  color: #ffaa00;
}
.pid-params {
  margin-bottom: 12px;
}
.pid-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pid-item label {
  color: #b0c4de;
  min-width: 28px;
  font-size: 13px;
}
.tune-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tune-progress {
  flex: 1;
  min-width: 120px;
}
.tune-result {
  font-size: 12px;
  color: #00d68f;
}
.tune-failed {
  font-size: 12px;
  color: #ff3d71;
}

/* ===== 脚注 ===== */
.footnote {
  margin-top: 16px;
  font-size: 12px;
  color: #7a8b9f;
  text-align: center;
  line-height: 1.8;
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
