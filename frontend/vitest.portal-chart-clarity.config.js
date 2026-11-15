import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/utils/__tests__/clientEncounterClarity.test.js',
    'src/composables/__tests__/useClientEncounters.clarity.test.js',
    'src/components/admin/clientChart/__tests__/ClientChartClarity.test.js',
    'src/components/admin/clientChart/__tests__/ClientRecordsOverview.receipts.test.js',
    'src/components/conversa/__tests__/ClientNotificationHistory.test.js',
    'src/components/safetyPlans/__tests__/PortalDocumentAssignment.test.js',
    'src/components/safetyPlans/__tests__/EnrollmentPortalDocuments.test.js'
  ] }
});
