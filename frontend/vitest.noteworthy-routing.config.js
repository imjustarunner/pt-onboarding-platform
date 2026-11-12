import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, cacheDir: '/private/tmp/noteworthy-demo-routing-vite-cache', plugins: [vue()], test: { environment: 'jsdom', include: ['src/utils/__tests__/fundthred.test.js', 'src/utils/__tests__/publicDomainRouting.test.js', 'src/router/__tests__/fundthredRoutes.test.js', 'src/router/__tests__/noteworthyRoutes.test.js', 'src/services/__tests__/sharedReads.test.js'] } });
