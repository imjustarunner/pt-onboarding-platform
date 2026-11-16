import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/components/admin/__tests__/TransitionWeekBoard.test.js',
  'src/components/admin/__tests__/SmsPhoneEnrollmentQueue.test.js',
  'src/components/admin/__tests__/SmsCampaignReadiness.test.js',
  'src/components/admin/__tests__/AuricWellTransitionWorkbench.test.js'
] } });
