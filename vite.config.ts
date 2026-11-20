/**
 * vite.config.ts — 管理后台 Vite 构建/开发服务配置
 *
 * 职责：
 * 1. 注册 Vue 单文件组件插件；
 * 2. 定义 `@` -> `src` 别名（与 tsconfig 路径别名保持一致）；
 * 3. 配置本地开发服务器端口与后端代理。
 *
 * 关键流程：开发期浏览器访问 5190，`/api`、`/static` 请求被代理到 FastAPI 后端 8000 端口，
 *          因此前端代码统一使用相对路径（如 `/api/admin/login`），生产环境交由 Nginx 反向代理。
 * 注意：后端地址硬编码为 127.0.0.1:8000，若后端不在本机需修改 proxy target。
 */
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
    // 开发代理：接口与静态资源均转发到 FastAPI 后端
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})