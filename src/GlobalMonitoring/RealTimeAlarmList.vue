<template>
  <div class="alarm-list">
    <el-table :data="alarmList" max-height="200" border style="width:100%">
      <el-table-column prop="time" label="时间" width="110" />
      <el-table-column prop="content" label="内容" width="100" />
      <el-table-column prop="code" label="车号" width="120" />
      <el-table-column prop="worker" label="工号" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import socket from '@/socket'

const alarmList = ref([])

function handleFullUpdate(data) {
  // 取最新10条（假设 warningList 已按时间倒序）
  alarmList.value = (data.warningList || []).slice(0, 10)
}

onMounted(() => {
  socket.on('fullUpdate', handleFullUpdate)
})
onUnmounted(() => {
  socket.off('fullUpdate', handleFullUpdate)
})
</script>