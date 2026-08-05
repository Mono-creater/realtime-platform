import {createApp} from 'vue'
import {createPinia} from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import DataVVue3 from '@kjgl77/datav-vue3'


import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(DataVVue3)

/**
 * 仪表盘组件入口文件
 */
import DashboardGauge from '@/components/DashboardGauge.vue';

// 导出组件
export default DashboardGauge;

// 导出安装方法
export const install = (Vue) => {
    Vue.component(DashboardGauge.name, DashboardGauge);
};

// 自动安装
if (typeof window !== 'undefined' && window.Vue) {
    window.Vue.use({install});
}


app.mount('#app')
