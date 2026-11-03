import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({ template: { transformAssetUrls: false } })],
  test: { environment: 'jsdom', include: [
    'src/utils/__tests__/intakeContactRole.test.js',
    'src/utils/__tests__/linkedGuardianSummary.test.js',
    'src/components/admin/__tests__/OfficeIntakeQueuePanel.retest.test.js',
    'src/components/schedule/__tests__/CanceledSessionDetails.test.js',
    'src/components/schedule/__tests__/SchoolAbsenceRecords.test.js',
    'src/views/__tests__/LoginPortalIsolation.test.js'
  ] }
});
