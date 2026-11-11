import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: {
  environment: 'jsdom', restoreMocks: true, include: ['src/directives/__tests__/staticAddressBindings.test.js', 'src/views/public/__tests__/AdaptiveJoinAddress.test.js', 'src/views/public/__tests__/JoinEnrollmentExperience.test.js', 'src/views/public/__tests__/AdaptiveJoinHub.test.js', 'src/components/events/__tests__/EventTravelReportModal.test.js', 'src/components/billing/__tests__/BillingPracticeSettings.test.js']
} });
