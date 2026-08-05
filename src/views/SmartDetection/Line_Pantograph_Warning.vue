<!-- 碳滑板告警详情页面 -->
<template>
  <div class="warning">
    <!-- 顶部区域 -->
    <div class="header">
      <!-- 顶部内容 start -->
      <!-- 左侧：标题和图例 -->
      <div class="header-left">
        <span class="header-title">告警详细信息</span>
        <!-- 图例区 -->
        <div class="legend-item"><span class="legend legend-pressure"></span>压力超限</div>
        <div class="legend-item"><span class="legend legend-pull"></span>拉出值超限</div>
        <div class="legend-item"><span class="legend legend-arc"></span>燃弧超限</div>
        <div class="legend-item"><span class="legend legend-height"></span>导高超限</div>
      </div>
      <!-- 右侧：logo -->
      <div class="header-logo" @click="handleBack">
        <img src="/src/assets/images/yg_logo.png" alt="logo" class="logo-img" />
        <span class="logo-text">驭弓大师</span>
      </div>
      <!-- 顶部内容 end -->
    </div>
    <!-- 内容区域 -->
    <div class="container">
      <!-- 左侧告警详细信息 -->
      <div class="leftInfo">
        <!-- 顶部三卡片 start -->
        <div class="alarm-cards-row">
          <!-- 告警类型卡片 -->
          <div class="alarm-card">
            <div class="alarm-card-title">告警类型</div>
            <div class="alarm-card-value alarm-type">压力超限</div>
          </div>
          <!-- 告警等级卡片 -->
          <div class="alarm-card">
            <div class="alarm-card-title">告警等级</div>
            <div class="alarm-card-value alarm-level">一级</div>
          </div>
          <!-- 告警值卡片 -->
          <div class="alarm-card">
            <div class="alarm-card-title">告警值</div>
            <div class="alarm-card-value alarm-value">-260.2</div>
          </div>
        </div>
        <!-- 顶部三卡片 end -->
  <!-- 左下角返回按钮（优化样式） -->
            <div class="back-bottom">
             <div class="back-btn-custom" @click="$router.go(-1)">
             <span>返回</span>
           </div>
        </div>
        <!-- 三列信息，两行展示 start -->
        <div class="alarm-info-row">
          <div class="alarm-info-col">
            <div><span class="alarm-info-label">告警状态：</span>告警</div>
            <div><span class="alarm-info-label">区站：</span>A站至B站</div>
            <div><span class="alarm-info-label">定位点号：</span>RC11-073</div>
            <div>
              <span class="alarm-info-label">发现时间：</span
              ><span class="alarm-info-strong">03-12 14:45:36</span>
            </div>
          </div>
          <div class="alarm-info-col">
            <div><span class="alarm-info-label">车号：</span>19</div>
            <div><span class="alarm-info-label">行别：</span>下行</div>
            <div><span class="alarm-info-label">来源：</span>实时上传</div>
          </div>
          <div class="alarm-info-col">
            <div><span class="alarm-info-label">线路：</span>5号线</div>
            <div><span class="alarm-info-label">公里标：</span>K23+357</div>
            <div><span class="alarm-info-label">速度：</span>60km/h</div>
          </div>
        </div>
        <!-- 三列信息，两行展示 end -->
        <!-- 路线 start -->
        <div class="alarm-route-row">
          <div class="alarm-route-bar">
            <!-- 白色路线 -->
            <div class="route-line"></div>
            <!-- 居中文字 -->
            <div class="route-label">A站至B站</div>
            <!-- 闪烁黄色光点 -->
            <div class="route-glow"></div>
          </div>
        </div>
        <!-- 路线 end -->
        <!-- 表格 -->
        <div class="alarm-table">
          <!-- 标题 -->
          <div class="alarm-table-title">同位置其他缺陷</div>
          <dv-scroll-board :config="alarmTableConfig" style="height: 120px; width: 100%" />
        </div>
      </div>
      <!-- 右侧图片和视频 -->
      <div class="rightMedia">
        <!-- 右上：可放大图片 -->
        <el-image
          class="right-img"
          :src="urlImg"
          fit="fill"
          :preview-src-list="[]"
          @click="handleImageClick"
          style="
            cursor: pointer;
            width: 100%;
            height: 100%;
            border-radius: 8px;
            margin-bottom: 1%;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
            background: #222;
          "
        />
        <!-- 全屏图片预览组件，只有 showFullScreenImg 为 true 时显示 -->
        <FullScreenImage v-if="showFullScreenImg" :src="urlImg" @close="handleFullScreenClose" />
        <!-- 右下：自动循环播放视频 -->
        <video
          class="right-video"
          :src="urlMedia"
          controls
          autoplay
          loop
          muted
          style="
            width: 100%;
            height: 48%;
            border-radius: 8px;
            background: #000;
            object-fit: cover;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import carbonWarnImg from '@/assets/images/carbonWarn.png'
import carbonMedia from '@/assets/media/carbonVideo.mp4'
import { nextTick, ref } from 'vue' // 新增 ref 用于控制全屏图片显示
import FullScreenImage from '@/components/FullScreenImage.vue' // 引入自定义全屏图片组件
import { useRouter } from 'vue-router'

const router = useRouter()

const showFullScreenImg = ref(false) // 控制全屏图片显示的状态
const urlImg = carbonWarnImg
const urlMedia = carbonMedia
// mock 同位置其他缺陷表格数据
const alarmTableData = [['03-12 14:45:36', '一级', '-260.2', '压力超限', '60.0']]
const alarmTableConfig = {
  header: ['发现时间', '缺陷等级', '缺陷值', '缺陷类型', '速度'],
  data: alarmTableData,
  rowNum: 2,
  headerBGC: '#2441f4',
  oddRowBGC: '#2170b8',
  evenRowBGC: '#335dd3',
  align: ['center', 'center', 'center', 'center', 'center'],
  headerHeight: 36,
  rowHeight: 32,
  index: false,
}

function handleImagePreview() {
  nextTick(() => {
    const viewer = document.querySelector('.el-image-viewer__wrapper')
    if (viewer && viewer.requestFullscreen) {
      viewer.requestFullscreen()
    } else if (viewer && viewer.webkitRequestFullscreen) {
      viewer.webkitRequestFullscreen()
    }
  })
}

// 点击图片时显示全屏图片
function handleImageClick() {
  showFullScreenImg.value = true
}
// 关闭全屏图片
function handleFullScreenClose() {
  showFullScreenImg.value = false
}

function handleBack() {
  router.push({
    name: 'MonitorLine',
  })
}
</script>

<style scoped>
@font-face {
  font-family: 'FZYTJW';
  src: url('@/assets/fonts/FZYTJW.TTF') format('truetype');
  font-weight: normal;
  font-style: normal;
}
.warning {
  width: 100%;
  height: 100vh;
  background-color: #0f2592;
}
.header {
  width: 100%;
  height: 10%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-sizing: border-box;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}
.header-title {
  color: #00c6ff;
  font-weight: bold;
  font-size: 22px;
}
.legend-item {
  display: flex;
  align-items: center;
  color: #fff;
  font-size: 15px;
}
.legend {
  display: inline-block;
  width: 20px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
}
.legend-pressure {
  background: #f5af88;
}
.legend-pull {
  background: #93cd4f;
}
.legend-arc {
  background: #fcfa15;
}
.legend-height {
  background: #4470c8;
}
.header-logo {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.header-logo:hover {
  cursor: pointer;
}
.logo-img {
  height: 35px;
  vertical-align: middle;
}
.logo-text {
  color: #fff;
  font-size: 20px;
  font-family: 'FZYTJW', sans-serif;
}
.container {
  width: 100%;
  height: 90%;
  display: flex;
}
.leftInfo {
  width: 55%;
  height: 100%;
  background-color: #0f2592;
  padding: 18px 18px 0 18px;
  box-sizing: border-box;
}
/* 顶部三卡片横向排列 */
.alarm-cards-row {
  display: flex;
  gap: 18px;
  margin-bottom: 18px;
}
.alarm-card {
  flex: 1;
  background-color: #1964a5;
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70px;
  padding: 0 0 12px 0;
  box-sizing: border-box;
}
.alarm-card-title {
  color: #fff;
  font-size: 16px;
  margin-bottom: 6px;
  font-weight: bold;
  border-radius: 2px;
  background-color: #3871c2;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 0 5px 10px;
}
.alarm-card-value {
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 2px;
}
.alarm-type {
  color: #ffe14c;
}
.alarm-level {
  color: #ffe14c;
}
.alarm-value {
  color: #ffe14c;
}
/* 三列信息，两行展示 */
.alarm-info-row {
  display: flex;
  gap: 18px;
  margin-bottom: 10px;
}
.alarm-info-col {
  flex: 1;
  color: #fff;
  font-size: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.alarm-info-label {
  color: #b6e0ff;
  font-weight: bold;
}
.alarm-info-strong {
  color: #fff;
  font-size: 18px;
  font-weight: bold;
}
.rightMedia {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: none;
  padding: 10px;
  box-sizing: border-box;
}
.right-img,
.right-video {
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  background: #222;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  object-fit: contain;
  display: block;
}
.right-video {
  background: #000;
}
.alarm-route-row {
  width: 100%;
  margin: 18px 0 18px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.alarm-route-bar {
  position: relative;
  width: 80%;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.route-line {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: 6px;
  background: linear-gradient(90deg, #fff 0%, #e6e6e6 100%);
  border-radius: 3px;
  transform: translateY(-50%);
  z-index: 1;
}
.route-label {
  position: absolute;
  left: 60%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  opacity: 0.5;
  font-size: 16px;
  font-weight: bold;
  z-index: 2;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px #000;
}
.route-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe14c 60%, rgba(255, 225, 76, 0.1) 100%);
  filter: blur(4px);
  z-index: 999;
  animation: route-glow-blink 1s infinite;
}
@keyframes route-glow-blink {
  0% {
    opacity: 0;
    filter: blur(1px);
  }
  50% {
    opacity: 0.4;
    filter: blur(4px);
  }
  100% {
    opacity: 0.8;
    filter: blur(5px);
  }
}
.alarm-table {
  width: 100%;
  margin-top: 10px;
}
.alarm-table-title {
  color: #00c6ff;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
  border-left: 6px solid #00c6ff;
  padding-left: 12px;
  letter-spacing: 2px;
}
/* ---------- 左下角返回按钮（自定义样式） ---------- */
.back-bottom {
  position: fixed;
  bottom: 30px;
  left: 30px;
  z-index: 999;
}

.back-btn-custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(4px);
  user-select: none;
  letter-spacing: 1px;
}

/* 鼠标悬停效果 */
.back-btn-custom:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.6);
  transform: scale(1.04);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* 点击效果（按下时） */
.back-btn-custom:active {
  transform: scale(0.96);
  background: rgba(255, 255, 255, 0.25);
}
</style>