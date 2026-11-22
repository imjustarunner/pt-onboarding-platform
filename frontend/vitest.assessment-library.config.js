import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('..', import.meta.url).pathname,
  plugins: [vue()],
  publicDir: new URL('./public', import.meta.url).pathname,
  test: {
    environment: 'node', restoreMocks: true,
    include: [
      'backend/src/services/__tests__/outcomeMeasuresScoring.test.js',
      'backend/src/services/__tests__/additionalOutcomeScoring.test.js',
      'backend/src/services/__tests__/outcomeMeasuresAccess.test.js',
      'backend/src/services/__tests__/clientUpdateAccess.test.js',
      'backend/src/services/__tests__/liveOutcomeContext.test.js',
      'backend/src/services/__tests__/appointmentStaffTools.test.js',
      'frontend/src/components/clinical/__tests__/OutcomeMeasures.test.js',
      'frontend/src/components/clinical/__tests__/AppointmentLiveAssessments.test.js',
      'frontend/src/components/admin/__tests__/ClientUpdateModal.test.js',
      'frontend/src/utils/__tests__/vanderbiltProgress.test.js',
      'frontend/src/utils/__tests__/outcomeTrends.test.js'
    ]
  }
});
