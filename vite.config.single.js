import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 单 HTML 文件构建：所有 JS/CSS 内联，产物可直接双击打开
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    sourcemap: false
  }
})
