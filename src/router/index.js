import { createRouter, createWebHistory } from 'vue-router'
import Index from '@/views/index.vue'
import MonitorGlobal from '@/views/SmartDetection/MonitorGlobal.vue'
import MonitorLine from '@/views/SmartDetection/MonitorLine.vue'
import MonitorCar from '@/views/SmartDetection/MonitorCar.vue'
import FaultOverview from '@/views/SmartDetection/FaultOverview.vue'
import Line_Pantograph from '@/views/SmartDetection/Line_Pantograph2.vue'
import PantographWarning from '@/views/SmartDetection/PantographWarning.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Index',
      component: Index,
      redirect: 'monitor_line',
      children: [
        {
          path: '/',
          name: 'MonitorGlobalRoot',
          component: MonitorGlobal,
        },
        {
          path: 'monitor_global',
          name: 'MonitorGlobal',
          component: MonitorGlobal,
        },
        {
          path: 'monitor_line',
          name: 'MonitorLine',
          component: MonitorLine,
        },
        {
          path: 'monitor_car',
          name: 'MonitorCar',
          component: MonitorCar,
        },
        {
          path: 'fault_overview',
          name: 'FaultOverview',
          component: FaultOverview,
        },
      ],
    },
    // 受电弓详情
    {
      path: '/moterline_pantograph',
      name: 'LinePantograph',
      component: Line_Pantograph,
    },
    // 告警详情（数据驱动页；旧路由重定向兼容，透传 query）
    {
      path: '/pantograph-warning',
      name: 'PantographWarning',
      component: PantographWarning,
    },
    {
      path: '/moterline_pantograph_warning',
      name: 'LinePantographWarning',
      redirect: (to) => ({ name: 'PantographWarning', query: to.query }),
    },
  ],
})

export default router
