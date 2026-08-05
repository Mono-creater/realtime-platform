<template>
  <div class="stat-card">
    <div class="stat-icon">
      <el-icon :size="32"><component :is="icon" /></el-icon>
    </div>
    <div class="stat-content">
      <div class="stat-value">{{ value }}</div>
      <div class="stat-label">{{ title }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: String,
  value: [String, Number],
  icon: String // 如 'Van', 'Warning', 'Success', 'Check'
})
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 16px 20px;
  backdrop-filter: blur(4px);
  transition: 0.3s;
}
.stat-card:hover {
  border-color: #00c6ff;
  box-shadow: 0 0 20px rgba(0,198,255,0.2);
}
.stat-icon {
  margin-right: 16px;
  color: #00c6ff;
}
.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
}
.stat-label {
  font-size: 14px;
  color: #b0c4de;
}
</style>