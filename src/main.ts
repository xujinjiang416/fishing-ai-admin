import { createPinia } from 'pinia'
import naive from 'naive-ui'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

import './assets/styles.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 全局注册 naive-ui：各页面模板里的 n-* 组件直接可用
app.use(naive)
app.mount('#app')