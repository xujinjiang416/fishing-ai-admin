/**
 * vite.config.ts — 管理后台 Vite 构建/开发服务配置
 *
 * 职责：
 * 1. 注册 Vue 单文件组件插件；
 * 2. 定义 `@` -> `src` 别名（与 tsconfig 路径别名保持一致）；
 * 3. 配置本地开发服务器端口与后端代理。
 *
 * 关键流程：开发期浏览器访问 5190，`/api`、`/static` 请求被代理到云托管，
 *          本地无需启动 FastAPI；如需联调本地后端，把 API_TARGET 改为 http://127.0.0.1:8000。
 */
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** 本地开发代理目标：云托管公网域名 */
const API_TARGET = 'https://fishing-api-355464-8-1306325032.sh.run.tcloudbase.com'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 路径别名：`@/xxx` 指向 src/xxx，避免深层相对路径
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 5173 通常被 fishing-ai-uniapp 的 H5 dev 占用，管理后台固定用 5190
    // host 绑 127.0.0.1：避免只监听 IPv6 localhost（::1），浏览器/自动化用 IPv4 访问
    host: '127.0.0.1',
    port: 5190,
    // 开发代理：接口与静态资源均转发到云托管
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/static': { target: API_TARGET, changeOrigin: true },
    },
  },
})