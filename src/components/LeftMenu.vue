<template>
  <!-- 左侧菜单 -->
  <div class="menu">
    <el-menu
      default-active="monitor_line"
      class="el-menu-vertical-demo"
      background-color="transparent"
      text-color="#fff"
      @open="handleOpen"
      @close="handleClose"
      @select="handleMenuSelect"
    >
      <!-- 智慧监测子菜单（带图标） -->
      <el-sub-menu index="1">
        <template #title>
          <span>智慧监测</span>
        </template>
        <el-menu-item index="monitor_global">全局监测</el-menu-item>
        <el-menu-item index="monitor_line">线路监控</el-menu-item>
        <el-menu-item index="monitor_car">环境参数</el-menu-item>
        <el-menu-item index="fault_overview">故障总览</el-menu-item>
      </el-sub-menu>
      <el-sub-menu index="2">
        <template #title>
          <span>智慧列车</span>
        </template>
        <el-menu-item index="2-1">全局监测</el-menu-item>
        <el-menu-item index="2-2">线路监控</el-menu-item>
        <el-menu-item index="2-3">故障分析</el-menu-item>
        <el-menu-item index="2-4">故障总览</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="3">
        <template #title>
          <span>智慧检修</span>
        </template>
        <el-menu-item index="3-1">全局监测</el-menu-item>
        <el-menu-item index="3-2">线路监控</el-menu-item>
        <el-menu-item index="3-3">故障分析</el-menu-item>
        <el-menu-item index="3-4">故障总览</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="4">
        <template #title>
          <span>智慧分析</span>
        </template>
        <el-menu-item index="4-1">全局监测</el-menu-item>
        <el-menu-item index="4-2">线路监控</el-menu-item>
        <el-menu-item index="4-3">故障分析</el-menu-item>
        <el-menu-item index="4-4">故障总览</el-menu-item>
      </el-sub-menu>
    </el-menu>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
// 菜单展开/收起事件
const handleOpen = (key, keyPath) => {
  console.log('菜单展开:', key, keyPath)
}
const handleClose = (key, keyPath) => {
  console.log('菜单收起:', key, keyPath)
}

// 菜单选中事件（关键）
const currentActive = ref('monitor_line')
const handleMenuSelect = (key) => {
  currentActive.value = key
  router.push(key)
}
</script>

<style scoped>
.menu {
  height: 100vh;
  overflow-y: auto;
  scrollbar-width: none;
}
.menu::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
</style>