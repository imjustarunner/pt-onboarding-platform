import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  publicDir: false,
  plugins: [vue()],
  test: { environment: 'jsdom', include: ['src/components/messages/__tests__/MessagePulse.test.js', 'src/composables/__tests__/useMessageViews.test.js'] }
});
