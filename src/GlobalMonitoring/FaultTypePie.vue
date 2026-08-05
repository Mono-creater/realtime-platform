<!-- 位置：src/components/charts/FaultTypePie.vue -->
<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'

const chartRef = ref(null)
let chartInstance = null

const fetchPieData = async () => {
  // 模拟数据，实际替换为 axios.get('/api/stats/distribution')
  return [
    { name: '压力超限', value: 45 },
    { name: '导高超限', value: 28 },
    { name: '燃弧超限', value: 17 },
    { name: '拉出值超限', value: 10 }
  ]
}

const initChart = async () => {
  if (!chartRef.value) return
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const data = await fetchPieData()
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10, 30, 50, 0.8)',
      borderColor: '#00c6ff',
      textStyle: { color: '#fff' }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#b0c4de' },
      itemWidth: 12,
      itemHeight: 12
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: '#b0c4de',
          fontSize: 12
        },
        emphasis: {
          scale: true,
          label: { show: true }
        },
        data: data,
        color: ['#2ca7e0', '#1b8edb', '#0e6fb7', '#ffc107']
      }
    ]
  }
  chartInstance.setOption(option)
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
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 180px;
}
</style>