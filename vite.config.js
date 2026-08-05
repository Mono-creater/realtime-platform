import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // ========== 新增代理配置 ==========
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // 后端地址，如果端口不同请修改
        changeOrigin: true,
        rewrite: (path) => path // 保持原路径不变
      }
    }
  }
})