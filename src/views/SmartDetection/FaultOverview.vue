<template>
  <div class="fault-overview">
    <!-- 标题与搜索栏 -->
    <div class="overview-header">
      <span class="title">📋 实时故障总览</span>
      <el-input
        v-model="keyword"
        placeholder="搜索车号/内容/编号..."
        clearable
        prefix-icon="Search"
        size="default"
        class="search-input"
      />
    </div>

    <!-- 滚动表格容器 -->
    <div class="scroll-wrapper" ref="scrollWrapper">
      <el-table
        :data="filteredData"
        border
        max-height="100%"
        row-key="id"
        class="scroll-table"
        style="width: 100%;"
        @row-click="handleRowClick"
        :row-class-name="rowClassName"
      >
        <el-table-column label="序号" type="index" width="60" align="center" />
        <el-table-column prop="code" label="碳滑板编号" min-width="120" align="center" />
        <el-table-column prop="content" label="预警内容" min-width="100" align="center" />
        <el-table-column prop="time" label="预警时间" min-width="110" align="center" />
        <el-table-column prop="worker" label="维修人工号" min-width="110" align="center" />
        <el-table-column prop="remark" label="备注" min-width="80" align="center">
          <template #default="{ row }">
            {{ row.remark === '/' ? '—' : row.remark }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态（无数据或搜索无结果） -->
      <div v-if="filteredData.length === 0" class="empty-placeholder">
        <el-empty
          :description="keyword ? '该车辆无故障记录' : '暂无故障记录'"
          :image-size="80"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

// ---------- 数据 ----------
const allData = ref([])
const keyword = ref('')
const scrollWrapper = ref(null)
let scrollTimer = null
const SCROLL_SPEED = 1.2
const FRAME_INTERVAL = 30

// 选中的行ID
const selectedRowId = ref(null)

// ---------- 过滤 ----------
const filteredData = computed(() => {
  if (!keyword.value.trim()) return allData.value
  const lower = keyword.value.toLowerCase()
  return allData.value.filter(item =>
    item.code?.toLowerCase().includes(lower) ||
    item.content?.toLowerCase().includes(lower) ||
    item.worker?.toLowerCase().includes(lower) ||
    item.time?.includes(keyword.value)
  )
})

// ---------- 获取数据 ----------
async function fetchData() {
  try {
    const res = await axios.get('http://localhost:3000/api/history')
    allData.value = res.data.map(item => ({
      id: item.id,
      code: item.code,
      content: item.content,
      time: item.time ? new Date(item.time).toISOString().slice(0, 10) : '',
      worker: item.worker || '',
      remark: item.remark || '/',
    }))
    if (scrollWrapper.value) {
      scrollWrapper.value.scrollTop = 0
    }
  } catch (err) {
    ElMessage.error('加载故障数据失败：' + err.message)
    console.error(err)
  }
}

// ---------- 行点击事件 ----------
function handleRowClick(row) {
  // 切换选中状态（点击同一行取消选中，或保持高亮）
  if (selectedRowId.value === row.id) {
    selectedRowId.value = null
  } else {
    selectedRowId.value = row.id
  }
}

// 行类名动态绑定
function rowClassName({ row }) {
  return row.id === selectedRowId.value ? 'selected-row' : ''
}

// ---------- 自动滚动 ----------
function startAutoScroll() {
  stopAutoScroll()
  if (filteredData.value.length === 0) return

  scrollTimer = setInterval(() => {
    const container = scrollWrapper.value
    if (!container) return

    const tableBody = container.querySelector('.el-table__body-wrapper')
    if (!tableBody) return

    const maxScroll = tableBody.scrollHeight - tableBody.clientHeight
    if (maxScroll <= 0) return

    let current = tableBody.scrollTop
    let next = current + SCROLL_SPEED

    if (next >= maxScroll) {
      tableBody.scrollTop = 0
    } else {
      tableBody.scrollTop = next
    }
  }, FRAME_INTERVAL)
}

function stopAutoScroll() {
  if (scrollTimer) {
    clearInterval(scrollTimer)
    scrollTimer = null
  }
}

// ---------- 监听过滤变化，重置滚动 ----------
watch(filteredData, () => {
  // 清除选中状态
  selectedRowId.value = null
  nextTick(() => {
    const container = scrollWrapper.value
    if (container) {
      const tableBody = container.querySelector('.el-table__body-wrapper')
      if (tableBody) tableBody.scrollTop = 0
    }
    startAutoScroll()
  })
})

// ---------- 生命周期 ----------
onMounted(async () => {
  await fetchData()
  nextTick(() => {
    startAutoScroll()
  })
})

onBeforeUnmount(() => {
  stopAutoScroll()
})
</script>

<style scoped>
/* ---------- 整体容器 ---------- */
.fault-overview {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgba(10, 46, 93, 0.3);
  border-radius: 12px;
  padding: 16px 20px 20px 20px;
  box-sizing: border-box;
  color: #fff;
}

/* ---------- 头部 ---------- */
.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.overview-header .title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #e0f0ff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.search-input {
  width: 260px;
}

.search-input :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.search-input :deep(.el-input__wrapper:hover) {
  border-color: rgba(0, 198, 255, 0.6);
}
.search-input :deep(.el-input__inner) {
  color: #fff;
}
.search-input :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.5);
}
.search-input :deep(.el-input__prefix) {
  color: rgba(255, 255, 255, 0.5);
}

/* ---------- 滚动容器 ---------- */
.scroll-wrapper {
  flex: 1;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
  position: relative;
}

.scroll-table {
  height: 100%;
  background: transparent;
}

/* 表格头样式 */
.scroll-table :deep(.el-table__header-wrapper) {
  background: #0a2e5d !important;
}
.scroll-table :deep(.el-table__header-wrapper th) {
  background: #0a2e5d !important;
  color: #fff !important;
  font-weight: 600;
}

/* 表格体滚动 */
.scroll-table :deep(.el-table__body-wrapper) {
  overflow-y: auto !important;
  scroll-behavior: smooth;
}
.scroll-table :deep(.el-table__body-wrapper::-webkit-scrollbar) {
  width: 4px;
}
.scroll-table :deep(.el-table__body-wrapper::-webkit-scrollbar-track) {
  background: transparent;
}
.scroll-table :deep(.el-table__body-wrapper::-webkit-scrollbar-thumb) {
  background: rgba(123, 229, 229, 0.5);
  border-radius: 10px;
}

/* 行样式：无条纹，统一背景 */
.scroll-table :deep(.el-table__row) {
  background: rgba(255, 255, 255, 0.04) !important;
  color: #e8edf3;
  transition: all 0.2s ease;
}

/* 悬停效果 */
.scroll-table :deep(.el-table__row:hover) {
  background: rgba(123, 229, 229, 0.1) !important;
}

/* ---------- 选中行：边框泛光效果 ---------- */
.scroll-table :deep(.el-table__row.selected-row) {
  background: rgba(0, 198, 255, 0.08) !important;
  box-shadow: inset 0 0 0 2px #00c6ff, 0 0 20px rgba(0, 198, 255, 0.4) !important;
  border-radius: 4px; /* 使边框圆角 */
  transition: box-shadow 0.3s, background 0.3s;
}

/* 点击反馈：瞬间缩放效果（通过行内元素的伪类或过渡） */
.scroll-table :deep(.el-table__row:active) {
  transform: scale(0.99);
  transition: transform 0.1s;
}

/* 边框透明 */
.scroll-table :deep(.el-table__inner-wrapper) {
  border: none;
}
.scroll-table :deep(.el-table__body) {
  border: none;
}
.scroll-table :deep(.el-table__border-left-patch) {
  display: none;
}
.scroll-table :deep(.el-table__border-right-patch) {
  display: none;
}

/* ---------- 空状态 ---------- */
.empty-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  text-align: center;
  pointer-events: none;
}
</style>