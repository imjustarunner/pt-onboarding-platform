import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { realpathSync } from 'node:fs';
export default defineConfig({ plugins: [vue()], server: { fs: { allow: [
  new URL('.', import.meta.url).pathname,
  realpathSync(new URL('./node_modules', import.meta.url))
] } }, test: { environment: 'jsdom', include: [
  'src/components/__tests__/HirePortalNavigation.test.js',
  'src/components/handbook/__tests__/WorkplaceHandbookPortal.test.js',
  'src/components/training/__tests__/DocumentLearning.test.js',
  'src/views/__tests__/hire.portal.test.js'
] } });
