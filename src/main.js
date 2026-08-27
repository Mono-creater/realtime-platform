import {createApp} from 'vue'
import {createPinia} from 'pinia'
import DataVVue3 from '@kjgl77/datav-vue3'
import './assets/fonts.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(DataVVue3)

app.mount('#app')
