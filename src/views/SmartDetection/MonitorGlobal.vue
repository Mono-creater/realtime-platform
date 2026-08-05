<template>
  <div class="monitor-global" v-loading="loading" element-loadting-text="加载数据中...">
    <!-- ===== 统计卡片行 ===== -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6" v-for="(item, idx) in statCards" :key="item.label">
        <div class="stat-card" :style="{ '--delay': idx * 0.1 + 's' }">
          <div class="stat-icon"><el-icon :size="36"><component :is="item.icon" /></el-icon></div>
          <div class="stat-content">
            <div class="stat-value" :style="{ color: item.color || '#ffffff' }">{{ item.value }}</div>
            <div class="stat-label">{{ item.label }}</div>
          </div>
          <div class="stat-glow"></div>
        </div>
      </el-col>
    </el-row>

    <!-- ===== 中间行：实时告警 + 线路状态 ===== -->
    <el-row :gutter="20" class="middle-row">
      <el-col :span="14">
        <div class="panel panel-alarm">
          <div class="panel-header">
            <span class="header-icon"><el-icon><Bell /></el-icon></span>
            实时告警
            <span class="badge">{{ alarmList.length }}</span>
            <el-button
              size="small"
              type="primary"
              @click="addRandomAlarm"
              style="margin-left: auto;"
            >
              随机生成
            </el-button>
          </div>
          <el-table :data="alarmList" max-height="220" border style="width:100%">
            <el-table-column prop="time" label="时间" width="120" />
            <el-table-column prop="content" label="内容" width="120" />
            <el-table-column prop="code" label="车号" width="140" />
            <el-table-column prop="worker" label="工号" />
            <el-table-column label="操作" width="80" align="center">
              <template #default="{ row }">
                <el-button size="small" type="danger" @click.stop="deleteAlarm(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-footer" v-if="alarmList.length === 0">暂无实时告警</div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel panel-map">
          <div class="panel-header"><span class="header-icon"><el-icon><Location /></el-icon></span>线路状态</div>
          <div class="line-status-content">
            <div class="line-item" v-for="line in lines" :key="line.name">
              <span class="line-name">{{ line.name }}</span>
              <div class="line-bar"><div class="line-fill" :style="{ width: line.health + '%', background: line.color }"></div></div>
              <span class="line-health">{{ line.health }}%</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ===== 底部图表行 ===== -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <div class="panel panel-chart">
          <div class="panel-header"><span class="header-icon"><el-icon><TrendCharts /></el-icon></span>告警趋势（近7天）</div>
          <div ref="trendChartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel panel-chart">
          <div class="panel-header"><span class="header-icon"><el-icon><PieChart /></el-icon></span>告警类型分布</div>
          <div v-if="filteredWarningList.length > 0" ref="pieChartRef" class="chart-container"></div>
          <div v-else style="height:200px;display:flex;align-items:center;justify-content:center;color:#b0c4de;font-size:16px;">暂无数据</div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Van, Warning, CircleCheck, Monitor, Bell, Location, TrendCharts, PieChart } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import socket from '@/socket'

// ---------- 常量 ----------
// 只保留四种受电弓告警类型（环境预警已过滤）
const ALARM_TYPES = ['压力超限', '导高超限', '燃弧超限', '拉出值超限']

// 权重字典（用于健康度计算，保留所有类型以便健康度受所有告警影响）
const ALARM_WEIGHTS = {
  '压力超限': 10,
  '导高超限': 8,
  '燃弧超限': 5,
  '拉出值超限': 3,
  '高温预警': 6,
  '低温预警': 4,
  '高压报警': 10,
  '低压报警': 6,
  '高湿预警': 5
}

const HEALTH_DECAY_FACTOR = 0.5
const DEFAULT_WEIGHT = 3

function getHealthColor(health) {
  if (health >= 80) return '#00d68f'
  if (health >= 50) return '#ffaa00'
  return '#ff3d71'
}

// ---------- 模拟数据（仅四种核心告警） ----------
const MOCK_STATS = {
  onlineVehicles: 128,
  todayAlarms: 23,
  handleRate: 94,
  health: 98
}
const MOCK_ALARMS = [
  { time: '2026-07-06 10:30', content: '压力超限', code: 'THB000001', worker: 'WX-1234' },
  { time: '2026-07-06 09:15', content: '导高超限', code: 'THB000002', worker: 'WX-5678' },
  { time: '2026-07-05 22:40', content: '燃弧超限', code: 'THB000003', worker: 'WX-9012' },
  { time: '2026-07-05 18:20', content: '拉出值超限', code: 'THB000004', worker: 'WX-3456' },
]

// ---------- 状态 ----------
const loading = ref(false)
const statCards = ref([])
// fullWarningList 存储所有告警（用于健康度计算），但显示时过滤
const fullWarningList = ref([...MOCK_ALARMS])
// 过滤后的告警列表（仅四种核心告警）
const filteredWarningList = computed(() => {
  return fullWarningList.value.filter(item => ALARM_TYPES.includes(item.content))
})
// 显示列表（最新10条过滤后的）
const alarmList = ref([...MOCK_ALARMS])
const lines = ref([
  { name: '1号线', health: 92, color: '#2ca7e0' },
  { name: '2号线', health: 85, color: '#1b8edb' },
  { name: '3号线', health: 78, color: '#0e6fb7' },
  { name: '4号线', health: 95, color: '#00c6ff' },
])

const trendChartRef = ref(null)
const pieChartRef = ref(null)
let trendChart = null
let pieChart = null

// ---------- 计算函数 ----------
function getTodayAlarms(list) {
  const today = new Date().toISOString().slice(0, 10)
  return list.filter(item => item.time && item.time.startsWith(today)).length
}

function calculateHealth(list) {
  if (!list || list.length === 0) return 100
  let totalScore = 0
  list.forEach(item => {
    const weight = ALARM_WEIGHTS[item.content] || DEFAULT_WEIGHT
    totalScore += weight
  })
  let health = 100 - totalScore * HEALTH_DECAY_FACTOR
  return Math.max(0, Math.min(100, Math.round(health)))
}

function updateStats(list) {
  const todayAlarms = getTodayAlarms(list)
  const health = calculateHealth(list)
  const healthColor = getHealthColor(health)

  const baseStats = statCards.value.length > 0 ? statCards.value : [
    { label: '在线车辆', value: MOCK_STATS.onlineVehicles, icon: 'Van', color: '#ffffff' },
    { label: '今日告警', value: MOCK_STATS.todayAlarms, icon: 'Warning', color: '#ffffff' },
    { label: '处理率', value: MOCK_STATS.handleRate + '%', icon: 'CircleCheck', color: '#ffffff' },
    { label: '碳滑板健康度', value: MOCK_STATS.health + '%', icon: 'Monitor', color: '#ffffff' }
  ]

  statCards.value = [
    { label: '在线车辆', value: baseStats[0].value, icon: 'Van', color: '#ffffff' },
    { label: '今日告警', value: todayAlarms, icon: 'Warning', color: '#ffffff' },
    { label: '处理率', value: baseStats[2].value, icon: 'CircleCheck', color: '#ffffff' },
    { label: '碳滑板健康度', value: health + '%', icon: 'Monitor', color: healthColor }
  ]
}

// ---------- 更新显示列表（过滤后取前10条） ----------
function updateAlarmList() {
  const filtered = fullWarningList.value.filter(item => ALARM_TYPES.includes(item.content))
  alarmList.value = filtered.slice(0, 10)
}

// ---------- 随机生成告警（只生成四种核心告警） ----------
async function addRandomAlarm() {
  const types = ALARM_TYPES
  const randomType = types[Math.floor(Math.random() * types.length)]
  const now = new Date()
  const timestamp = now.toISOString()

  const payload = {
    cameraId: 'CAM_SIM',
    timestamp: timestamp,
    alarmType: randomType,
    level: ['一级', '二级', '三级'][Math.floor(Math.random() * 3)],
    value: Math.round((Math.random() * 300 + 50) * 10) / 10,
    code: 'THB' + String(Math.floor(100000 + Math.random() * 900000)),
    worker: 'WX-' + String(Math.floor(1000 + Math.random() * 9000)),
    carNumber: String(Math.floor(1 + Math.random() * 50)),
    line: ['1号线', '2号线', '3号线', '4号线', '5号线'][Math.floor(Math.random() * 5)],
    station: 'A站至B站',
    direction: ['上行', '下行'][Math.floor(Math.random() * 2)],
    location: 'RC' + String(Math.floor(10 + Math.random() * 90)),
    mileage: 'K' + String(Math.floor(10 + Math.random() * 90)) + '+' + String(Math.floor(100 + Math.random() * 900)),
    speed: Math.floor(40 + Math.random() * 60),
    imageUrl: 'http://example.com/sim_' + Date.now() + '.jpg',
    videoUrl: ''
  }

  try {
    const res = await axios.post('/api/alert', payload)
    if (res.data.success) {
      ElMessage.success(`已模拟发送 ${randomType} 告警 (ID: ${res.data.id})`)
    }
  } catch (err) {
    ElMessage.error('发送失败: ' + err.message)
    console.error(err)
  }
}

// ---------- 删除告警 ----------
async function deleteAlarm(id) {
  try {
    await ElMessageBox.confirm('确认删除该告警记录？', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const res = await axios.delete(`/api/warning/${id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      const index = fullWarningList.value.findIndex(item => item.id === id)
      if (index !== -1) {
        fullWarningList.value.splice(index, 1)
        updateAlarmList()
        updateStats(fullWarningList.value)
        updateTrendChart()
        if (filteredWarningList.value.length > 0) {
          await nextTick()
          await updatePieChart()
        } else {
          if (pieChart) pieChart.clear()
        }
      }
    }
  } catch (err) {
    if (err === 'cancel') return
    ElMessage.error('删除失败: ' + (err.response?.data?.error || err.message))
    console.error(err)
  }
}

// ---------- 从历史 API 加载数据 ----------
async function fetchHistory() {
  try {
    const res = await axios.get('/api/history')
    const history = res.data.map(item => ({
      id: item.id,
      code: item.code,
      content: item.content,
      time: item.time ? new Date(item.time).toISOString().slice(0, 10) : '',
      worker: item.worker || '',
      remark: item.remark || '/',
    }))
    fullWarningList.value = history
    updateAlarmList()
    updateStats(history)
    updateTrendChart()
    if (filteredWarningList.value.length > 0) {
      await nextTick()
      await updatePieChart()
    } else {
      if (pieChart) pieChart.clear()
    }
  } catch (err) {
    console.error('加载历史数据失败:', err)
  }
}

// ---------- 获取统计卡片数据 ----------
async function fetchStatistics() {
  try {
    const res = await axios.get('/api/stats/summary')
    const data = res.data
    if (!data || typeof data.onlineVehicles === 'undefined') {
      applyMockStats()
      return
    }
    const health = data.health !== undefined ? data.health : calculateHealth(fullWarningList.value)
    const healthColor = getHealthColor(health)
    statCards.value = [
      { label: '在线车辆', value: data.onlineVehicles || 0, icon: 'Van', color: '#ffffff' },
      { label: '今日告警', value: data.todayAlarms || 0, icon: 'Warning', color: '#ffffff' },
      { label: '处理率', value: (data.handleRate || 0) + '%', icon: 'CircleCheck', color: '#ffffff' },
      { label: '碳滑板健康度', value: health + '%', icon: 'Monitor', color: healthColor }
    ]
  } catch {
    applyMockStats()
  }
}

function applyMockStats() {
  const health = calculateHealth(fullWarningList.value)
  const todayAlarms = getTodayAlarms(fullWarningList.value)
  const healthColor = getHealthColor(health)
  statCards.value = [
    { label: '在线车辆', value: MOCK_STATS.onlineVehicles, icon: 'Van', color: '#ffffff' },
    { label: '今日告警', value: todayAlarms || MOCK_STATS.todayAlarms, icon: 'Warning', color: '#ffffff' },
    { label: '处理率', value: MOCK_STATS.handleRate + '%', icon: 'CircleCheck', color: '#ffffff' },
    { label: '碳滑板健康度', value: health + '%', icon: 'Monitor', color: healthColor }
  ]
}

// ========== 饼图只统计四种受电弓告警类型 ==========
function getDistributionFromList(list) {
  const counts = {}
  // 初始化四种类型计数为0
  ALARM_TYPES.forEach(type => { counts[type] = 0 })
  list.forEach(item => {
    if (counts.hasOwnProperty(item.content)) {
      counts[item.content]++
    }
  })
  return ALARM_TYPES.map(name => ({ name, value: counts[name] }))
}
// ============================================================

// ---------- 趋势图 ----------
function calculateTrendData(list) {
  const days = 7
  const result = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().slice(0, 10)
    // 趋势图统计过滤后的核心告警
    const filtered = list.filter(item => ALARM_TYPES.includes(item.content))
    const count = filtered.filter(item => item.time && item.time.startsWith(dateStr)).length
    result.push({ date: dateStr, count })
  }
  return {
    dates: result.map(d => d.date.slice(5)),
    counts: result.map(d => d.count)
  }
}

function updateTrendChart() {
  if (!trendChart) return
  const data = calculateTrendData(fullWarningList.value)
  const option = {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(10,30,50,0.9)', borderColor: '#00c6ff', textStyle: { color: '#fff' } },
    grid: { left: '3%', right: '3%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: '#2a4a6a' } },
      axisLabel: { color: '#b0c4de', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { color: '#b0c4de' }
    },
    series: [{
      name: '告警数',
      type: 'line',
      data: data.counts,
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { color: '#00c6ff', width: 3 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,198,255,0.4)' },
          { offset: 1, color: 'rgba(0,198,255,0.02)' }
        ])
      },
      itemStyle: { color: '#00c6ff' }
    }]
  }
  trendChart.setOption(option, true)
}

// ---------- 饼图（平滑更新） ----------
async function updatePieChart() {
  if (!pieChartRef.value) return
  if (filteredWarningList.value.length === 0) {
    if (pieChart) pieChart.clear()
    return
  }

  const data = getDistributionFromList(filteredWarningList.value)
  const filteredData = data.filter(d => d.value > 0)
  const finalData = filteredData.length > 0 ? filteredData : [
    { name: '压力超限', value: 10 },
    { name: '导高超限', value: 8 },
    { name: '燃弧超限', value: 5 },
    { name: '拉出值超限', value: 3 }
  ]

  const colors = ['#2ca7e0', '#1b8edb', '#0e6fb7', '#ffc107']

  const option = {
    tooltip: { trigger: 'item', backgroundColor: 'rgba(10,30,50,0.9)', borderColor: '#00c6ff', textStyle: { color: '#fff' } },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#b0c4de', fontSize: 13 },
      itemWidth: 14,
      itemHeight: 14
    },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: '{b}\n{d}%',
        color: '#b0c4de',
        fontSize: 12
      },
      emphasis: {
        scale: false,
        label: { show: true }
      },
      data: finalData,
      color: colors,
      animationDuration: 800,
      animationEasing: 'cubicOut'
    }]
  }

  if (pieChart) {
    pieChart.setOption(option)
  } else {
    pieChart = echarts.init(pieChartRef.value, 'dark')
    pieChart.setOption(option)
  }
  pieChart.resize()
}

// ---------- 初始化趋势图 ----------
async function initTrendChart() {
  if (!trendChartRef.value) return
  if (trendChart) trendChart.dispose()
  trendChart = echarts.init(trendChartRef.value, 'dark')
  updateTrendChart()
}

// ---------- WebSocket ----------
function handleFullUpdate(data) {
  if (data.warningList) {
    fullWarningList.value = data.warningList
    updateAlarmList()
    updateStats(fullWarningList.value)
    updateTrendChart()
    if (filteredWarningList.value.length > 0) {
      nextTick(() => updatePieChart())
    } else {
      if (pieChart) pieChart.clear()
    }
  } else {
    fullWarningList.value = []
    alarmList.value = []
    updateStats(fullWarningList.value)
    updateTrendChart()
    if (pieChart) pieChart.clear()
  }
}

// ---------- 自适应 ----------
function handleResize() {
  trendChart?.resize()
  pieChart?.resize()
}

// ---------- 生命周期 ----------
onMounted(async () => {
  await initTrendChart()
  await fetchHistory()
  socket.on('fullUpdate', handleFullUpdate)
  await fetchStatistics()
  window.addEventListener('resize', handleResize)

  const timer = setInterval(async () => {
    await fetchStatistics()
  }, 30000)
  window.__globalTimer = timer
})

onUnmounted(() => {
  socket.off('fullUpdate', handleFullUpdate)
  window.removeEventListener('resize', handleResize)
  if (window.__globalTimer) {
    clearInterval(window.__globalTimer)
    delete window.__globalTimer
  }
  trendChart?.dispose()
  pieChart?.dispose()
})
</script>

<style scoped>
/* ---------- 全局 ---------- */
.monitor-global {
  width: 100%;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
  overflow-y: auto;
  background: radial-gradient(ellipse at 50% 0%, rgba(0, 198, 255, 0.05) 0%, transparent 70%);
}

/* ---------- 统计卡片 ---------- */
.stat-row {
  margin-bottom: 20px;
}
.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 18px 24px;
  backdrop-filter: blur(8px);
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  overflow: hidden;
  animation: cardFadeIn 0.6s ease forwards;
  animation-delay: var(--delay, 0s);
  opacity: 0;
}
.stat-card:hover {
  border-color: #00c6ff;
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 198, 255, 0.15);
}
.stat-card .stat-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 30% 30%, rgba(0, 198, 255, 0.05), transparent 70%);
  pointer-events: none;
  transition: 0.5s;
}
.stat-card:hover .stat-glow {
  transform: scale(1.2);
  opacity: 0.5;
}
.stat-icon {
  margin-right: 16px;
  color: #00c6ff;
  filter: drop-shadow(0 0 8px rgba(0, 198, 255, 0.3));
}
.stat-value {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.stat-label {
  font-size: 14px;
  color: #b0c4de;
  margin-top: 2px;
  letter-spacing: 0.5px;
}
@keyframes cardFadeIn {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ---------- 面板 ---------- */
.panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 18px 20px;
  backdrop-filter: blur(4px);
  transition: border-color 0.3s;
  height: 100%;
}
.panel:hover {
  border-color: rgba(0, 198, 255, 0.2);
}
.panel-header {
  display: flex;
  align-items: center;
  color: #b0c4de;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.header-icon {
  margin-right: 10px;
  color: #00c6ff;
}
.badge {
  background: rgba(0, 198, 255, 0.2);
  color: #00c6ff;
  border-radius: 12px;
  padding: 0 10px;
  font-size: 12px;
  margin-left: 10px;
  line-height: 20px;
}

/* ---------- 线路状态 ---------- */
.line-status-content {
  padding: 4px 0;
}
.line-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.line-name {
  width: 60px;
  color: #b0c4de;
  font-size: 14px;
}
.line-bar {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,0.08);
  border-radius: 10px;
  margin: 0 12px;
  overflow: hidden;
}
.line-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 1s ease;
  box-shadow: 0 0 12px rgba(0,198,255,0.3);
}
.line-health {
  color: #b0c4de;
  font-size: 13px;
  min-width: 40px;
  text-align: right;
}

/* ---------- 表格 ---------- */
:deep(.el-table) {
  background: transparent !important;
  border-radius: 8px;
  overflow: hidden;
}
:deep(.el-table th.el-table__cell) {
  background: rgba(10, 46, 93, 0.6) !important;
  color: #fff !important;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-weight: 500;
}
:deep(.el-table tr) {
  background: rgba(255, 255, 255, 0.04) !important;
}
:deep(.el-table tr:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
  outline: none !important;
}
:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: #e8edf3;
}
:deep(.el-table__body-wrapper) {
  background: transparent !important;
}
:deep(.el-table__inner-wrapper) {
  border: none;
}
.table-footer {
  text-align: center;
  color: #4a6a8a;
  padding: 20px 0;
  font-size: 14px;
}

/* ---------- 图表 ---------- */
.chart-container {
  width: 100%;
  height: 200px;
  background: transparent !important;
}

/* ---------- 滚动条 ---------- */
.monitor-global::-webkit-scrollbar {
  width: 4px;
}
.monitor-global::-webkit-scrollbar-track {
  background: transparent;
}
.monitor-global::-webkit-scrollbar-thumb {
  background: rgba(0, 198, 255, 0.3);
  border-radius: 10px;
}
.monitor-global::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 198, 255, 0.6);
}
</style>