<template>
  <div class="dashboard">
    <!-- 统计卡片行 -->
    <el-row :gutter="20">
      <el-col :span="6"><StatCard title="在线车辆" value="128" icon="Van" /></el-col>
      <el-col :span="6"><StatCard title="今日告警" value="23" icon="Warning" /></el-col>
      <el-col :span="6"><StatCard title="处理率" value="94%" icon="Success" /></el-col>
      <el-col :span="6"><StatCard title="受电弓健康度" value="98%" icon="Check" /></el-col>
    </el-row>

    <!-- 中间行：列表 + 地图 -->
    <el-row :gutter="20" style="margin-top:20px;">
      <el-col :span="14">
        <div class="panel">
          <div class="panel-header">实时告警</div>
          <RealTimeAlarmList />
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel">
          <div class="panel-header">线路状态</div>
          <LineStatusMap />
        </div>
      </el-col>
    </el-row>

    <!-- 底部图表行 -->
    <el-row :gutter="20" style="margin-top:20px;">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-header">告警趋势（近7天）</div>
          <FaultTrendChart />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-header">告警类型分布</div>
          <FaultTypePie />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import StatCard from '@/components/StatCard.vue'
import RealTimeAlarmList from '@/components/RealTimeAlarmList.vue'
import LineStatusMap from '@/components/LineStatusMap.vue'
import FaultTrendChart from '@/components/FaultTrendChart.vue'
import FaultTypePie from '@/components/FaultTypePie.vue'
</script>

<style scoped>
.dashboard {
  padding: 0;
}
.panel {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
}
.panel-header {
  color: #b0c4de;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 12px;
  border-left: 4px solid #00c6ff;
  padding-left: 12px;
}
</style>