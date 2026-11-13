import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()],
  test: { environment: 'jsdom', restoreMocks: true, include: ['src/components/admin/__tests__/ClientSchoolRoiEvidence.test.js'] } });
