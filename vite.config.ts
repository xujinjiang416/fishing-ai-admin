import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 5173 通常被 fishing-ai-uniapp 的 H5 dev 占用，管理后台固定用 5190
    // host 绑 127.0.0.1：避免只监听 IPv6 localhost（::1），浏览器/自动化用 IPv4 访问
    host: '127.0.0.1',
    port: 5190,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})