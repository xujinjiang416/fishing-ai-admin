/**
 * main.ts — Vue 应用入口
 *
 * 职责：创建应用实例，依次装配 Pinia（状态管理）、Vue Router（路由）、Naive UI（组件库）
 *      与全局样式，最后挂载到 index.html 的 `#app` 节点。
 * 关键流程：createApp -> use(Pinia) -> use(router) -> use(naive) -> mount。
 * 依赖：src/App.vue 根组件、src/router/index.ts 路由表、src/assets/styles.css 设计 token。
 * 注意：naive 为全量注册（体积较大），用于各视图模板中直接书写 `n-*` 组件而无需逐个导入；
 *      挂载顺序不影响功能，但 Pinia 需在组件内使用 store 之前完成安装。
 */
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

import './assets/styles.css'

/** Vue 应用实例：装配 Pinia/Router/Naive UI 后挂载到 #app */
const app = createApp(App)
app.use(createPinia())
app.use(router)
// 全局注册 naive-ui：各页面模板里的 n-* 组件直接可用
app.use(naive)
app.mount('#app')