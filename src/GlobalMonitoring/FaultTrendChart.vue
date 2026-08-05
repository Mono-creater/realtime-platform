<!-- 位置：src/components/charts/FaultTrendChart.vue -->
<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'

const chartRef = ref(null)
let chartInstance = null

// 获取数据（可替换为真实API）
const fetchTrendData = async () => {
  // 模拟数据，实际替换为 axios.get('/api/stats/trend')
  return {
    dates: ['07-01', '07-02', '07-03', '07-04', '07-05', '07-06', '07-07'],
    counts: [5, 12, 8, 15, 10, 22, 18]
  }
}

// 初始化图表
const initChart = async () => {
  if (!chartRef.value) return
  // 销毁旧实例（避免重复初始化）
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const data = await fetchTrendData()
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10, 30, 50, 0.8)',
      borderColor: '#00c6ff',
      textStyle: { color: '#fff' }
    },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '3%',
      top: '8%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: '#2a4a6a' } },
      axisLabel: { color: '#b0c4de' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { color: '#b0c4de' }
    },
    series: [
      {
        name: '告警数',
        type: 'line',
        data: data.counts,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#00c6ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 198, 255, 0.3)' },
            { offset: 1, color: 'rgba(0, 198, 255, 0.01)' }
          ])
        }
      }
    ]
  }
  chartInstance.setOption(option)
  // 窗口大小变化自适应
  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance?.resize()
}

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

// 若需要响应数据变化，可暴露更新方法
defineExpose({ updateChart: initChart })
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 180px;
}
</style>