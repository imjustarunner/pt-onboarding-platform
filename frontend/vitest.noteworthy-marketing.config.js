import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, cacheDir: '/private/tmp/noteworthy-demo-vite-cache', plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/noteworthy/__tests__/NoteworthyPayroll.test.js'] } });
