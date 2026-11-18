import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/components/admin/__tests__/TransitionWeekBoard.test.js',
  'src/components/transition/__tests__/*.test.js',
  'src/views/__tests__/PracticeTransitionView.test.js',
  'src/router/__tests__/transitionWorkspaceRoute.test.js',
  'src/navigation/__tests__/auricwellManagement.test.js',
  'src/components/admin/__tests__/SmsPhoneEnrollmentQueue.test.js',
  'src/components/admin/__tests__/SmsCampaignReadiness.test.js',
  'src/components/admin/__tests__/AuricWellTransitionWorkbench.test.js'
] } });
