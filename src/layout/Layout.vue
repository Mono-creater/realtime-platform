<template>
  <div class="layout">
    <el-row class="tac">
      <!-- 左侧菜单栏 -->
      <el-col :span="3">
        <LogoComponent />
        <LeftMenu></LeftMenu>
      </el-col>
      <!-- 右侧内容区域 -->
      <el-col class="right-content" :span="21">
        <router-view></router-view>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import LogoComponent from '@/components/LogoComponent.vue'
import LeftMenu from '@/components/LeftMenu.vue'
</script>

<style scoped>
.layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
.right-content {
  height: 100vh;
  overflow: auto;
}
</style>
