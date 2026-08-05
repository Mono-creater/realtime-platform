<template>
  <div class="warning-detail">
    <!-- 返回按钮 -->
    <div class="back-btn" @click="$router.go(-1)">
      <el-icon><ArrowLeft /></el-icon> 返回
    </div>

    <!-- 顶部区域 -->
    <div class="header">
      <div class="header-left">
        <span class="title">告警详细信息</span>
        <div class="legend">
          <span class="dot" style="background:#f5af88;"></span> 压力超限
          <span class="dot" style="background:#93cd4f;"></span> 拉出值超限
          <span class="dot" style="background:#fcfa15;"></span> 燃弧超限
          <span class="dot" style="background:#4470c8;"></span> 导高超限
        </div>
      </div>
      <div class="logo" @click="$router.push('/')">
        <img src="/src/assets/images/yg_logo.png" alt="logo" />
        <span>驭弓大师</span>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="container">
      <!-- 左侧详情 -->
      <div class="left-info">
        <!-- 三张卡片 -->
        <div class="cards">
          <div class="card">
            <div class="card-title">告警类型</div>
            <div class="card-value type">{{ detail.content || '--' }}</div>
          </div>
          <div class="card">
            <div class="card-title">告警等级</div>
            <div class="card-value level">{{ detail.level || '--' }}</div>
          </div>
          <div class="card">
            <div class="card-title">告警值</div>
            <div class="card-value value">{{ detail.value || '--' }}</div>
          </div>
        </div>

        <!-- 信息行 -->
        <div class="info-grid">
          <div class="col">
            <p><span class="label">告警状态：</span>告警</p>
            <p><span class="label">区站：</span>{{ detail.station || '--' }}</p>
            <p><span class="label">定位点号：</span>{{ detail.location || '--' }}</p>
            <p><span class="label">发现时间：</span><strong>{{ detail.time || '--' }}</strong></p>
          </div>
          <div class="col">
            <p><span class="label">车号：</span>{{ detail.carNumber || '--' }}</p>
            <p><span class="label">行别：</span>{{ detail.direction || '--' }}</p>
            <p><span class="label">来源：</span>实时上传</p>
          </div>
          <div class="col">
            <p><span class="label">线路：</span>{{ detail.line || '--' }}</p>
            <p><span class="label">公里标：</span>{{ detail.mileage || '--' }}</p>
            <p><span class="label">速度：</span>{{ detail.speed ? detail.speed + 'km/h' : '--' }}</p>
          </div>
        </div>

        <!-- 路线条 -->
        <div class="route-bar">
          <div class="route-line"></div>
          <div class="route-label">{{ detail.station || 'A站至B站' }}</div>
          <div class="route-glow"></div>
        </div>

        <!-- 同位置其他缺陷 -->
        <div class="table-section">
          <div class="table-title">同位置其他缺陷</div>
          <dv-scroll-board :config="tableConfig" style="height:120px;width:100%;" />
        </div>
      </div>

      <!-- 右侧图片+视频 -->
      <div class="right-media">
        <el-image
          v-if="detail.imageUrl"
          :src="detail.imageUrl"
          fit="cover"
          class="media-img"
          @click="previewImage"
        />
        <div v-else class="media-placeholder">暂无图片</div>

        <video
          v-if="detail.videoUrl"
          :src="detail.videoUrl"
          controls
          autoplay
          loop
          muted
          class="media-video"
        />
        <div v-else class="media-placeholder">暂无视频</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { ArrowLeft } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const detail = ref({});

// 同位置其他缺陷表格配置
const tableConfig = {
  header: ['发现时间', '缺陷等级', '缺陷值', '缺陷类型', '速度'],
  data: [
    [new Date().toLocaleString(), '一级', '-260.2', '压力超限', '60.0']
  ],
  rowNum: 2,
  headerBGC: '#2441f4',
  oddRowBGC: '#2170b8',
  evenRowBGC: '#335dd3',
  align: ['center', 'center', 'center', 'center', 'center'],
  headerHeight: 36,
  rowHeight: 32,
  index: false,
};

onMounted(async () => {
  const id = route.query.id;
  if (!id) {
    // 无ID时使用模拟数据（预览效果）
    detail.value = {
      content: '压力超限',
      level: '一级',
      value: '-260.2',
      carNumber: '19',
      line: '5号线',
      station: 'A站至B站',
      direction: '下行',
      location: 'RC11-073',
      mileage: 'K23+357',
      speed: 60,
      time: '2026-07-06',
      imageUrl: '',
      videoUrl: ''
    };
    return;
  }
  try {
    const res = await axios.get(`/api/warning/${id}`);
    detail.value = res.data;
  } catch (err) {
    console.error('加载详情失败', err);
  }
});

function previewImage() {
  // 可扩展为图片预览
}
</script>

<style scoped>
.warning-detail {
  width: 100%;
  height: 100vh;
  background: #0f2592;
  padding: 20px;
  box-sizing: border-box;
  color: #fff;
  overflow-y: auto;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: #00c6ff;
  margin-bottom: 16px;
  font-size: 16px;
}
.back-btn:hover {
  color: #fff;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  margin-bottom: 20px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 30px;
}
.title {
  font-size: 22px;
  font-weight: bold;
  color: #00c6ff;
}
.legend {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #b0c4de;
}
.legend .dot {
  display: inline-block;
  width: 16px;
  height: 8px;
  border-radius: 4px;
  margin-right: 6px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.logo img {
  height: 32px;
}
.logo span {
  font-family: 'FZYTJW', sans-serif;
  font-size: 20px;
}
.container {
  display: flex;
  gap: 20px;
  height: calc(100% - 100px);
}
.left-info {
  flex: 1.2;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cards {
  display: flex;
  gap: 16px;
}
.card {
  flex: 1;
  background: rgba(25, 100, 165, 0.7);
  border-radius: 8px;
  padding: 10px 0;
  text-align: center;
}
.card-title {
  background: #3871c2;
  padding: 4px 0;
  font-size: 14px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.card-value {
  font-size: 24px;
  font-weight: bold;
  color: #ffe14c;
}
.info-grid {
  display: flex;
  gap: 20px;
  font-size: 15px;
}
.info-grid .col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.info-grid .label {
  color: #b6e0ff;
  font-weight: bold;
}
.route-bar {
  position: relative;
  width: 80%;
  height: 28px;
  margin: 10px auto;
}
.route-line {
  position: absolute;
  top: 50%;
  width: 100%;
  height: 6px;
  background: linear-gradient(90deg, #fff, #ccc);
  transform: translateY(-50%);
  border-radius: 3px;
}
.route-label {
  position: absolute;
  left: 60%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255,255,255,0.5);
  font-weight: bold;
  letter-spacing: 2px;
}
.route-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe14c, rgba(255,225,76,0.1));
  filter: blur(4px);
  animation: glow-blink 1s infinite;
}
@keyframes glow-blink {
  0% { opacity: 0.2; transform: translate(-50%, -50%) scale(0.8); }
  50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.2); }
  100% { opacity: 0.2; transform: translate(-50%, -50%) scale(0.8); }
}
.table-section {
  margin-top: 10px;
}
.table-title {
  color: #00c6ff;
  font-size: 18px;
  font-weight: bold;
  border-left: 6px solid #00c6ff;
  padding-left: 12px;
  margin-bottom: 8px;
}
.right-media {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.media-img, .media-video, .media-placeholder {
  flex: 1;
  background: #222;
  border-radius: 8px;
  object-fit: contain;
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}
.media-img {
  cursor: pointer;
}
.media-img:hover {
  opacity: 0.8;
}
</style>