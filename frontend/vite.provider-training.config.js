import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, optimizeDeps: { entries: ['provider-training-preview.html'] }, server: { host: '127.0.0.1', port: 5196, strictPort: true } });
