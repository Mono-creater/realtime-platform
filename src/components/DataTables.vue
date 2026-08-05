<template>
  <!-- 线路监控模块下的组件 -->
  <div class="tabls">
    <!-- 最新告警列表 -->
    <div class="table-section1">
      <div class="table-title">
        <div class="info">最新告警列表</div>
        <div class="state">
          <div class="item">
            <!-- 复选框 -->
            <input type="checkbox" />
            <span>全部故障</span>
          </div>
        </div>
      </div>
      <dv-scroll-board @click="handleAlarmRowClick" :config="alarmConfig" style="height: 220px" />
    </div>
    <!-- 最新预警列表 -->
    <div class="table-section2">
      <div class="table-title">
        <div class="info">最新预警列表</div>
        <div class="state"></div>
      </div>
      <template v-if="warnConfig.data && warnConfig.data.length > 0">
        <dv-scroll-board :config="warnConfig" />
      </template>
      <template v-else>
        <div
          class="empty-tip"
          style="
            height: 220px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 12px;
          "
        >
          运行状态良好，最近24小时无预警发生。
        </div>
      </template>
    </div>
    <!-- 运行状态总览列表 -->
    <div class="table-section3">
      <div class="table-title">
        <div class="info">运行状态总览</div>
        <div class="state">
          <div class="item">
            <img style="margin-right: 3px" src="@/assets/icons/greenCircle.png" width="8" alt="" />
            <span>在线</span>
          </div>
          <div class="item">
            <img style="margin-right: 3px" src="@/assets/icons/greyCircle.png" width="8" alt="" />
            <span>离线</span>
          </div>
        </div>
      </div>
      <dv-scroll-board :config="statusConfig" style="height: 220px" />
    </div>
  </div>
</template>

<script setup>
import greenCircle from '@/assets/icons/greenCircle.png'
import greenPerson from '@/assets/icons/greenPerson.png'
import { useRouter } from 'vue-router'
const router = useRouter()
/**
 * 最新警告列表 mock 数据
 */
const alarmColumns = ['列车号', '告警名称', '告警等级', '告警时间']
const alarmData = [['519', '车辆：1车受电弓偏磨严重', '严重故障', '12-15 14：45']]
const alarmConfig = {
  header: alarmColumns,
  data: alarmData,
  rowNum: 5,
  headerBGC: '#0a2e5d',
  oddRowBGC: 'rgba(10,46,93,0.3)',
  evenRowBGC: 'rgba(10,46,93,0.1)',
  align: ['center'],
}
/**
 * 最新预警列表 mock 数据
 */
const warnColumns = ['列车号', '预警名称', '预警时间']
const warnData = []
const warnConfig = {
  header: warnColumns,
  data: warnData,
  rowNum: 5,
  headerBGC: '#0a2e5d',
  oddRowBGC: 'rgba(10,46,93,0.3)',
  evenRowBGC: 'rgba(10,46,93,0.1)',
  align: ['center'],
}
/**
 * 运行状态总览 mock 数据
 */
const statusColumns = ['列车号', '正线', '当前站', '终点站', '拥挤度', '运行状态', '速度']
const statusData = [
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />503`,
    '正线',
    '深圳站',
    '上海站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />5%`,
    'ATO',
    '35',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />504`,
    '正线',
    '上海站',
    '北京站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />12%`,
    'ATO',
    '42',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />505`,
    '正线',
    '北京站',
    '株洲站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />8%`,
    'ATO',
    '28',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />506`,
    '库内',
    '长沙站',
    '衡阳站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />18%`,
    'ATO',
    '55',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />507`,
    '库内',
    '长沙站',
    '郴州站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />25%`,
    'ATO',
    '38',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />508`,
    '正线',
    '衡阳站',
    '大理站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />15%`,
    'ATO',
    '48',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />511`,
    '正线',
    '大理站',
    '广州站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />22%`,
    'ATO',
    '62',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />513`,
    '正线',
    '深圳站',
    '株洲站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />10%`,
    'ATO',
    '33',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />518`,
    '正线',
    '北京站',
    '广州站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />16%`,
    'ATO',
    '41',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />519`,
    '库内',
    '长沙站',
    '郴州站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />14%`,
    'ATO',
    '37',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />520`,
    '库内',
    '郴州站',
    '衡阳站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />20%`,
    'ATO',
    '44',
  ],
  [
    `<img src="${greenCircle}" style="width:8px;vertical-align:middle;margin-right:2px" />521`,
    '主线',
    '衡阳站',
    '大理站',
    `<img src="${greenPerson}" style="width:16px;vertical-align:middle;" />12%`,
    'ATO',
    '29',
  ],
]
const statusConfig = {
  header: statusColumns,
  data: statusData,
  rowNum: 5,
  headerBGC: '#0a2e5d',
  oddRowBGC: 'rgba(10,46,93,0.3)',
  evenRowBGC: 'rgba(10,46,93,0.1)',
  align: ['center'],
  renderCell({ rowIndex, columnIndex, value }) {
    if (columnIndex === 0) {
      return `<img src="${greenC}" style="width:16px;vertical-align:middle;margin-right:2px;" />${value}`
    }
    if (columnIndex === 4) {
      return `<img src="${greenPeople}" style="width:16px;vertical-align:middle;margin-right:2px;" />${value}`
    }
    return value
  },
}

function handleAlarmRowClick(e) {
  console.log(e)
  router.push({
    name: 'LinePantograph',
    params: {
      id: e.rowIndex,
    },
  })
}
</script>

<style scoped>
.tabls {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}
.table-section1 {
  width: 30%;
  background: rgba(10, 46, 93, 0.5);
  border-radius: 5px;
  padding: 10px;
  margin: 0 5px;
  min-width: 0;
}
.table-section2 {
  width: 25%;
  background: rgba(10, 46, 93, 0.5);
  border-radius: 5px;
  padding: 10px;
  margin: 0 5px;
  min-width: 0;
}
.table-section3 {
  flex: 1;
  background: rgba(10, 46, 93, 0.5);
  border-radius: 5px;
  padding: 10px;
  margin: 0 5px;
  min-width: 0;
}
.table-title {
  color: #00eaff;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 5px;
  text-align: center;
  padding: 8px 0;
  border-radius: 5px;
  background: linear-gradient(90deg, #0a2e5d 0%, #00eaff 100%);
  letter-spacing: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 30px;
}

.table-title .state {
  display: flex;
  font-size: 12px;
  justify-self: flex-end;
  gap: 5px;
}
.table-section1 .table-title {
  background: linear-gradient(90deg, #310b0c 0%, #ec3329 100%);
  color: #eb3222;
}
.table-section2 .table-title {
  background: linear-gradient(90deg, #515d0a 0%, #ffe066 100%);
  color: #ffe066;
}
.table-section3 .table-title {
  background: linear-gradient(90deg, #0a2e5d 0%, #3be6c1 100%);
  color: #3be6c1;
}
:deep(.dv-scroll-board .header) {
  font-size: 12px !important; /* 表头字体大小 */
  color: #56c9f3;
  font-weight: 500;
}
:deep(.dv-scroll-board .rows .row-item) {
  font-size: 10px !important; /* 内容字体大小 */
  /* color: red; */
}
.table-section1 :deep(.dv-scroll-board .rows .row-item) {
  color: rgb(246, 85, 85);
}
.table-section1 :deep(.dv-scroll-board .rows .row-item:hover) {
  color: rgb(149, 12, 12); /* 更亮的红色 */
  filter: brightness(2); /* 或者用发光效果 */
  cursor: pointer;
  font-size: 11px !important;
}
</style>