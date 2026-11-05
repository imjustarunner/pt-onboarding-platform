import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root:new URL('.',import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/admin/__tests__/ManagementServiceCatalog.test.js', 'src/components/admin/__tests__/BusinessCommercialTerms.test.js', 'src/components/admin/__tests__/BusinessJourney.test.js'] } });
