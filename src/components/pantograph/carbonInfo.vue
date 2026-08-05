<!-- 受电弓详情-右侧碳滑板信息 -->
<template>
  <div class="carbonInfo">
    <!-- 基本信息展示区 -->
    <div class="basic-info">
      <div class="basic-info-title">基本信息</div>
      <div class="basic-info-row">
        <span>碳滑板编号：THB000001</span>
        <span>类型：纵型</span>
        <span>宽度：60mm</span>
        <span>维修周期：一个月</span>
        <span>下一次定期维修：2025-1-25</span>
      </div>
    </div>
<!-- 故障预警区 -->
<div class="warning-carousel">
  <div class="warning-title">故障预警</div>
  <!-- 有数据时渲染滚动板 -->
  <dv-scroll-board
    v-if="warningList.length > 0"
    @click="handleClick"
    :config="warningScrollConfig"
    style="height: 220px; width: 100%"
  />
  <!-- 无数据时显示提示 -->
  <div v-else class="empty-warning">暂无预警数据</div>
</div>
    <!-- 超限卡片区（点击卡片触发弹窗） -->
    <div class="over-limit-cards">
      <div
        class="over-limit-card"
        v-for="(card, idx) in overLimitCards"
        :key="card.title"
        @click="openModal(card.title)"
      >
        <img :src="overImgs[idx]" class="over-limit-bg" />
        <div class="over-limit-content">
          <div class="over-limit-title">{{ card.title }}</div>
          <div class="over-limit-count">
            <span class="over-limit-num">{{ card.count }}</span
            >次
          </div>
        </div>
      </div>
    </div>

    <!-- ====== 新增：超限详情弹窗 ====== -->
    <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
      <div class="modal-container">
        <div class="modal-header">
          <span class="modal-title">{{ selectedType }} · 故障车次列表</span>
          <span class="modal-badge">{{ filteredList.length }} 条</span>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <!-- 无数据 -->
          <div v-if="filteredList.length === 0" class="empty-state">
            暂无该类型故障记录
          </div>
          <!-- 表格 -->
          <div v-else class="table-wrapper">
            <table class="modal-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>碳滑板编号</th>
                  <th>预警内容</th>
                  <th>预警时间</th>
                  <th>维修人工号</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, index) in filteredList"
                  :key="item.id"
                  :class="index % 2 === 0 ? 'even-row' : 'odd-row'"
                >
                  <td>{{ index + 1 }}</td>
                  <td>{{ item.code }}</td>
                  <td>{{ item.content }}</td>
                  <td>{{ item.time }}</td>
                  <td>{{ item.worker }}</td>
                  <td>{{ item.remark === '/' ? '—' : item.remark }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import over1 from '@/assets/images/over12.png'
import over2 from '@/assets/images/over22.png'
import over3 from '@/assets/images/over33.png'
import over4 from '@/assets/images/over44.png'
import socket from '@/socket' // 导入 socket 实例

const router = useRouter()
const overImgs = [over1, over2, over3, over4]

// ---------- 实时数据（初始空，等待后端推送） ----------
const warningList = ref([])                  // 预警列表
const overLimitCards = ref([                 // 超限卡片，初始全 0
  { title: '压力超限', count: 0 },
  { title: '导高超限', count: 0 },
  { title: '燃弧超限', count: 0 },
  { title: '拉出值超限', count: 0 },
])

// ---------- 公共更新函数 ----------
function updateWarningData(newList) {
  // 确保是数组
  const list = Array.isArray(newList) ? newList : []
  warningList.value = list
  // 重新计算卡片计数
  const counts = {}
  list.forEach(w => { counts[w.content] = (counts[w.content] || 0) + 1 })
  overLimitCards.value = overLimitCards.value.map(card => ({
    ...card,
    count: counts[card.title] || 0,
  }))
}

// ---------- 从历史 API 加载初始数据 ----------
async function fetchInitialData() {
  try {
    const response = await axios.get('http://localhost:3000/api/history')
    // 转换数据格式（确保 time 为字符串 yyyy-mm-dd）
    const history = response.data.map(item => ({
      id: item.id,
      code: item.code,
      content: item.content,
      time: item.time ? new Date(item.time).toISOString().slice(0, 10) : '',
      worker: item.worker || '',
      remark: item.remark || '/',
    }))
    updateWarningData(history)
    console.log('✅ 初始数据加载完成，共', history.length, '条')
  } catch (err) {
    console.error('❌ 加载历史数据失败:', err)
    // 如果后端未启动，保留空数据，等待 WebSocket 推送
  }
}

// ---------- 动态滚动板配置（依赖 warningList） ----------
const warningScrollConfig = computed(() => ({
  header: ['序号', '碳滑板编号', '预警内容', '预警时间', '维修人工号', '备注'],
  data: warningList.value.map((item, index) => [
    index + 1,        // ✅ 序号从 1 开始连续编号
    item.code,
    item.content,
    item.time,
    item.worker,
    item.remark,
  ]),
  rowNum: 5,
  headerBGC: '#0a2e5d',
  oddRowBGC: 'rgba(10,46,93,0.3)',
  evenRowBGC: 'rgba(10,46,93,0.1)',
  align: ['center', 'center', 'center', 'center', 'center', 'center'],
  headerHeight: 36,
  rowHeight: 32,
  index: false,
}))
// ---------- 弹窗相关 ----------
const modalVisible = ref(false)
const selectedType = ref('')

// 根据选中的超限类型过滤预警列表
const filteredList = computed(() => {
  if (!selectedType.value) return []
  const list = Array.isArray(warningList.value) ? warningList.value : []
  return list.filter((item) => item.content === selectedType.value)
})

// 打开弹窗
function openModal(type) {
  selectedType.value = type
  modalVisible.value = true
}

// 关闭弹窗
function closeModal() {
  modalVisible.value = false
  // 可选：延迟重置类型，避免关闭时列表闪烁
  setTimeout(() => {
    selectedType.value = ''
  }, 200)
}

// ---------- 原有方法：点击滚动板跳转 ----------
function handleClick(e) {
  router.push({
    name: 'LinePantographWarning',
  })
}

// ---------- WebSocket 事件处理 ----------
function handleFullUpdate(data) {
  console.log('收到实时更新:', data) // 可保留用于调试
  // 更新预警列表
  if (data.warningList) {
    warningList.value = data.warningList
  }
  // 更新超限卡片计数
  if (data.overLimit) {
    overLimitCards.value = data.overLimit
  }
  // 如果有饼图数据，也可以在这里更新（当前组件未使用）
  // if (data.pieData) { ... }
}

// ---------- 生命周期 ----------
onMounted(() => {
  // 1. 先加载历史数据
  fetchInitialData()
  // 2. 监听 WebSocket 实时更新
  socket.on('fullUpdate', handleFullUpdate)
})

onUnmounted(() => {
  socket.off('fullUpdate', handleFullUpdate)
})
</script>

<style scoped>
/* ===== 原有样式（保持不变） ===== */
.empty-warning {
  color: #a0b8d0;
  text-align: center;
  padding: 40px 0;
  font-size: 16px;
  background: rgba(10,46,93,0.2);
  border-radius: 8px;
}
.carbonInfo {
  flex: 1;
  height: 100%;
  background: rgba(10, 46, 93, 0.4);
  border-radius: 5px;
  box-sizing: border-box;
}
.basic-info {
  border-radius: 8px 8px 0 0;
  padding: 12px 24px 8px 24px;
  margin-bottom: 8px;
}
.basic-info-title {
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 6px;
  border-left: 6px solid #7be5e5;
  padding-left: 10px;
}
.basic-info-row {
  color: #fff;
  font-size: 15px;
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 2px;
}
.warning-carousel {
  padding: 10px 24px 8px 24px;
  margin-bottom: 8px;
}
.warning-title {
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 6px;
  border-left: 6px solid #7be5e5;
  padding-left: 10px;
}
.over-limit-cards {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 16px;
  gap: 18px;
  padding: 0 20px;
}
.over-limit-card {
  flex: 1;
  max-width: 150px;
  min-height: 180px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer; /* 增加手型指针 */
  transition: transform 0.15s ease;
}
.over-limit-card:hover {
  transform: scale(1.03);
}
.over-limit-card:active {
  transform: scale(0.97);
}
.over-limit-bg {
  width: 100%;
  height: 180px;
  object-fit: contain;
  border-radius: 12px;
  display: block;
}
.over-limit-content {
  position: absolute;
  top: -15px;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}
.over-limit-title {
  color: #fff;
  font-size: 16px;
  text-shadow: 0 2px 8px #000;
}
.over-limit-count {
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 2px 8px #000;
}
.over-limit-num {
  color: #ff3b3b;
  font-size: 20px;
  font-weight: bold;
  margin-right: 2px;
}
.warning-carousel :deep(.dv-scroll-board .rows .row-item:hover) {
  color: #fff;
  cursor: pointer;
  font-size: 15px !important;
}

/* ===== 新增：弹窗样式 ===== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}
.modal-container {
  background: #1a2f4a; /* 深色背景，与整体风格匹配 */
  border-radius: 16px;
  max-width: 900px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.25s ease;
  border: 1px solid rgba(123, 229, 229, 0.2);
}
.modal-header {
  display: flex;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-wrap: wrap;
  gap: 12px;
}
.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  flex: 1;
}
.modal-badge {
  background: rgba(123, 229, 229, 0.2);
  color: #7be5e5;
  padding: 2px 14px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}
.modal-close {
  background: transparent;
  border: none;
  color: #a0b8d0;
  font-size: 24px;
  cursor: pointer;
  padding: 0 6px;
  transition: color 0.15s;
}
.modal-close:hover {
  color: #fff;
}
.modal-body {
  padding: 20px 24px 24px;
  overflow-y: auto;
  flex: 1;
}
.empty-state {
  color: #a0b8d0;
  text-align: center;
  padding: 40px 0;
  font-size: 16px;
}
.table-wrapper {
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.modal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  color: #e8edf3;
}
.modal-table thead th {
  background: #0a2e5d; /* 与 headerBGC 一致 */
  color: #fff;
  padding: 0 12px;
  height: 36px; /* headerHeight */
  text-align: center;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
  white-space: nowrap;
}
.modal-table tbody td {
  padding: 0 12px;
  height: 32px; /* rowHeight */
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.modal-table tbody .odd-row {
  background: rgba(10, 46, 93, 0.3); /* oddRowBGC */
}
.modal-table tbody .even-row {
  background: rgba(10, 46, 93, 0.1); /* evenRowBGC */
}
.modal-table tbody tr:hover {
  background: rgba(123, 229, 229, 0.1);
}

/* ===== 动画 ===== */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===== 响应式微调 ===== */
@media (max-width: 700px) {
  .modal-container {
    max-width: 100%;
    margin: 12px;
    border-radius: 12px;
  }
  .modal-header {
    padding: 14px 16px;
  }
  .modal-body {
    padding: 12px 16px 16px;
  }
  .modal-table {
    font-size: 13px;
  }
  .modal-table thead th,
  .modal-table tbody td {
    padding: 0 6px;
  }
}
</style>


