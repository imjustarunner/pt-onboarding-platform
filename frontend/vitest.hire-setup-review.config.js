import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/views/__tests__/hire.setup.test.js',
    'src/views/admin/__tests__/StartPreHire.nlu.test.js',
    'src/views/__tests__/hire.packages.test.js',
    'src/views/__tests__/hire.portal.test.js',
    'src/components/handbook/__tests__/WorkplaceHandbook.test.js',
    'src/components/hiring/__tests__/HireSetupReview.test.js'
  ] }
});
