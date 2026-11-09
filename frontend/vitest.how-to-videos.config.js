import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', globals: true, restoreMocks: true, include: [
    'src/components/__tests__/HowToVideoWidget.test.js',
    'src/components/dashboard/__tests__/OverviewEventsCard.training.test.js',
    'src/utils/__tests__/howToVideos.test.js'
  ] }
});
