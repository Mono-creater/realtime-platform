<template>
  <!-- 全屏图片预览蒙层，点击蒙层空白处关闭 -->
  <div class="fullscreen-image" @click.self="close">
    <!-- 显示图片本体 -->
    <img :src="src" class="img" />
    <!-- 右上角关闭按钮 -->
    <button class="close-btn" @click="close">×</button>
  </div>
</template>

<script setup>
// 接收图片地址 src 作为 prop
import { defineProps, defineEmits } from 'vue'
const props = defineProps({ src: String })
// 定义 close 事件，通知父组件关闭全屏预览
const emit = defineEmits(['close'])
function close() {
  emit('close')
}
</script>

<style scoped>
.fullscreen-image {
  position: fixed;
  z-index: 99999;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7); /* 半透明黑色背景 */
  display: flex;
  align-items: center;
  justify-content: center;
}
.img {
  width: 100vw;
  height: 100vh;
  object-fit: contain;
  border-radius: 0;
  box-shadow: none;
}
.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 24px;
  color: #fff;
  background: none;
  border: none;
  cursor: pointer;
  z-index: 100000;
}
</style> 