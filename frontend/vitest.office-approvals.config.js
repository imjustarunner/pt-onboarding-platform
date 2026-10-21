import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    include: ['src/views/__tests__/OfficeApprovalsView.test.js', 'src/views/__tests__/OfficeSettingsPhoto.test.js']
  }
});
