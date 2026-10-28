import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: ['src/components/communications/__tests__/CommunicationFailures.test.js'], restoreMocks: true }
});
