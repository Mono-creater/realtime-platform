<!-- 受电弓详情-左侧车组选择 -->
<template>
  <div class="trainSelect">
    <dv-border-box-8>
      <div class="trainSelect-inner">
        <!-- 车组选择标题和标签 -->
        <div class="train-title-row">
          <!-- 左侧小标签 -->
          <span class="train-title-tag"></span>
          <span class="train-title-text">车组选择</span>
        </div>
        <!-- 搜索框 -->
        <el-input
          v-model="searchText"
          placeholder="车组"
          :prefix-icon="Search"
          size="middle"
          style="margin-bottom: 10px"
          class="train-search-input"
        />
        <!-- 车组列表 -->
        <div class="train-btn-list">
          <el-button
            v-for="train in filteredTrainList"
            :key="train.id"
            class="train-btn"
            :style="getTrainBtnStyle(train)"
            @click="selectedTrain = train.id"
          >
            {{ train.id }}
          </el-button>
        </div>
      </div>
    </dv-border-box-8>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
// mock车组列表和状态
const trainList = [
  { id: '0503', status: 'green' },
  { id: '0504', status: 'orange' },
  { id: '0505', status: 'green' },
  { id: '0506', status: 'red' },
  { id: '0507', status: 'green' },
  { id: '0518', status: 'green' },
  { id: '0519', status: 'green' },
  { id: '0520', status: 'blue' },
  { id: '0521', status: 'blue' },
  { id: '0523', status: 'blue' },
  { id: '0524', status: 'blue' },
  { id: '0530', status: 'blue' },
  { id: '0531', status: 'blue' },
  { id: '0533', status: 'blue' },
]
const searchText = ref('')
const selectedTrain = ref(trainList[0].id)
const filteredTrainList = computed(() => {
  if (!searchText.value) return trainList
  return trainList.filter((t) => t.id.includes(searchText.value))
})
function getTrainBtnStyle(train) {
  let base = {
    width: '100%',
    marginBottom: '8px',
    fontSize: '18px',
    borderRadius: '10px',
    border: selectedTrain.value === train.id ? '1px solid #fff' : 'none',
    color: train.status === 'blue' ? '#fff' : '#222',
    backgroundColor: '#fff',
    boxShadow: 'none',
    height: '33px',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  }
  switch (train.status) {
    case 'green':
      base.backgroundColor = '#7fffc5'
      break
    case 'orange':
      base.backgroundColor = '#ffc600'
      break
    case 'red':
      base.backgroundColor = '#ff2323'
      base.color = '#fff'
      break
    case 'blue':
      base.backgroundColor = '#3772c8'
      base.color = '#fff'
      break
  }
  return base
}
</script>

<style scoped>
.trainSelect-inner {
  padding: 16px 10px 10px 10px; /* 上右下左，可根据需要调整 */
  box-sizing: border-box;
  height: 100%;
}
.trainSelect {
  width: 13%;
  height: 100%;
  /* background-color: #2e54a1; */
  margin-right: 10px;
  padding: 0 5px 0 5px;
  box-sizing: border-box;
}
.train-title-row {
  display: flex;
  align-items: center;
  margin: 5px 0 10px 0;
}
.train-title-tag {
  display: inline-block;
  width: 6px;
  height: 28px;
  background: #7be5e5;
  border-radius: 2px;
  margin-right: 10px;
}
.train-title-text {
  color: #fff;
  font-size: 20px;
  letter-spacing: 2px;
}
.train-search-input {
  width: 100%;
}
.train-btn-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
  box-sizing: border-box;
}
.train-btn {
  width: 100%;
  font-size: 16px;
  border-radius: 12px;
  border: none;
  height: 30px;
  margin: 0 0 5px 0;
  justify-content: center;
  align-items: center;
  display: flex;
  padding: 0;
  transition: border 0.2s;
  box-sizing: border-box;
}
.train-btn:last-child {
  margin-bottom: 0;
}
.train-btn:focus {
  outline: none;
}
.train-search-input :deep(.el-input__wrapper) {
  background-color: transparent !important;
}
</style>
