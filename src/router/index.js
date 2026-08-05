import { createRouter, createWebHistory } from 'vue-router'
import Index from '@/views/index.vue'
import MonitorGlobal from '@/views/SmartDetection/MonitorGlobal.vue'
import MonitorLine from '@/views/SmartDetection/MonitorLine.vue'
import MonitorCar from '@/views/SmartDetection/MonitorCar.vue'
import FaultOverview from '@/views/SmartDetection/FaultOverview.vue'
import Line_Pantograph from '@/views/SmartDetection/Line_Pantograph2.vue'
import Line_Pantograph_Warning from '@/views/SmartDetection/Line_Pantograph_Warning.vue'

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
          name: 'MonitorGlobal',
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
    // 受电弓告警详情（原路由，保持兼容）
    {
      path: '/moterline_pantograph_warning',
      name: 'LinePantographWarning',
      component: Line_Pantograph_Warning,
    },
    // ===== 新增：告警详情页（统一跳转名称） =====
    {
      path: '/pantograph-warning',
      name: 'PantographWarning',
      component: Line_Pantograph_Warning,
    },
  ],
})

export default router