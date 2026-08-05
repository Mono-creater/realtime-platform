<!-- 受电弓详情-受电弓信息 -->
<template>
  <div class="carbon">
    <el-tabs v-model="carbonTab" class="carbon-tabs" stretch>
      <el-tab-pane label="1位受电弓" name="first">
        <!-- 上方：碳滑板图片展示 -->
        <div class="carbon-img-wrap">
          <img :src="carbonContactStrip" style="width: 70%" alt="碳滑板" class="carbon-img" />
          <div class="carbon-img-label">碳滑板</div>
        </div>
        <!-- 下方：受电弓碳滑板偏磨情况占比饼图 -->
        <div class="carbon-pie-wrap">
          <div class="carbon-pie-title">受电弓碳滑板偏磨情况占比</div>
          <div class="carbon-pie-chart">
            <img :src="carbonPie" alt="饼图" class="carbon-pie-img" style="width: 100%" />
            <!-- 百分比数据定位 -->
            <span class="pie-label pie-label-main">66%</span>
            <span class="pie-label pie-label-side pie-label-side1">17%</span>
            <span class="pie-label pie-label-side pie-label-side2">17%</span>
          </div>
          <!-- 图例 -->
          <div class="carbon-pie-legend">
            <div class="legend-item">压力超限<span class="legend-color legend-color1"></span></div>
            <div class="legend-item">导高超限<span class="legend-color legend-color2"></span></div>
            <div class="legend-item">导高超限<span class="legend-color legend-color3"></span></div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="2位受电弓" name="second">
        <!-- 这里放2位受电弓内容 -->
          <!-- 上方：碳滑板图片展示 -->
        <div class="carbon-img-wrap">
          <img :src="carbonContactStrip" style="width: 70%" alt="碳滑板" class="carbon-img" />
          <div class="carbon-img-label">碳滑板</div>
        </div>
        <!-- 下方：受电弓碳滑板偏磨情况占比饼图 -->
        <div class="carbon-pie-wrap">
          <div class="carbon-pie-title">受电弓碳滑板偏磨情况占比</div>
          <div class="carbon-pie-chart">
            <img :src="carbonPie" alt="饼图" class="carbon-pie-img" style="width: 100%" />
            <!-- 百分比数据定位 -->
            <span class="pie-label pie-label-main">56%</span>
            <span class="pie-label pie-label-side pie-label-side1">27%</span>
            <span class="pie-label pie-label-side pie-label-side2">17%</span>
          </div>
          <!-- 图例 -->
          <div class="carbon-pie-legend">
            <div class="legend-item">压力超限<span class="legend-color legend-color1"></span></div>
            <div class="legend-item">导高超限<span class="legend-color legend-color2"></span></div>
            <div class="legend-item">导高超限<span class="legend-color legend-color3"></span></div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import carbonContactStrip from '@/assets/images/carbonGIF.gif'
import carbonPie from '@/assets/images/carbonPie.png'
const carbonTab = ref('first')
</script>

<style scoped>
.carbon {
  width: 30%;
  height: 100%;
  background: none;
  margin-right: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  padding: 10px 0;
  border-radius: 8px;
}
.carbon-tabs {
  width: 100%;
  height: 100%;
  --tab-bg: #7ad0ee;
  --tab-inactive: #b2d8e6;
  --tab-content-bg: rgba(10, 46, 93, 0.4);
}
.carbon :deep(.el-tabs__header) {
  background: none;
  border-bottom: none;
  margin-bottom: 0;
}
.carbon :deep(.el-tabs__nav) {
  border: none;
  background: none;
  overflow: hidden;
  border-radius: 5px 5px 0 0;
}
.carbon :deep(.el-tabs__item) {
  background: #132e5a;
  color: #fff;
  font-size: 18px;
  /* font-weight: normal; */
  margin-right: 0;
  transition: background 0.2s, color 0.2s;
  border: none;
  min-width: 0;
  padding: 8px 0;
}
.carbon :deep(.el-tabs__item.is-active) {
  color: #fff;
  /* font-weight: bold; */
  /* border-bottom: 4px solid #0593d3; */
}
.carbon :deep(.el-tabs__item:not(.is-active)) {
  /* background: #66a8c6; */
  color: #b2d8e6;
  font-weight: normal;
}
.carbon :deep(.el-tabs__active-bar) {
  background: #327ba1;
  height: 2px;
  border-radius: 2px 2px 0 0;
}
.carbon :deep(.el-tabs__content) {
  background: var(--tab-content-bg) !important;
  padding: 0;
}
.carbon-img-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 10px;
  position: relative;
  margin: 20px 0 30px 0;
}
@keyframes follow-gif {
  0% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-80px);
  } /* 40px为上下浮动幅度，可微调 */
  100% {
    transform: translateY(0);
  }
}
.carbon-img-label {
  position: absolute;
  left: 5%;
  top: 0;
  background: #fff;
  color: #222;
  border-radius: 8px;
  padding: 2px 14px;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  /* animation: follow-gif 1.2s linear infinite; */
}
.carbon-pie-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.carbon-pie-title {
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
}
.carbon-pie-chart {
  width: 100%;
  max-width: 260px;
  height: 140px;
  position: relative;
  margin: 0 auto 8px auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.carbon-pie-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pie-label {
  position: absolute;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  pointer-events: none;
  text-shadow: 0 1px 4px #000;
}
.pie-label-main {
  left: 62%;
  top: 54%;
  transform: translate(-50%, -50%);
}
.pie-label-side1 {
  left: 35%;
  top: 5%;
}
.pie-label-side2 {
  left: 15%;
  top: 20%;
}
.carbon-pie-legend {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 18px;
  margin-top: 25px;
}
.legend-item {
  display: flex;
  align-items: center;
  color: #fff;
  font-size: 15px;
}
.legend-color {
  display: inline-block;
  width: 25px;
  height: 10px;
  /* border-radius: 4px; */
  margin-left: 6px;
}
.legend-color1 {
  background: #2ca7e0;
}
.legend-color2 {
  background: #1b8edb;
}
.legend-color3 {
  background: #0e6fb7;
}
</style>
