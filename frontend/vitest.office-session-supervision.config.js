import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    include: [
      'src/components/schedule/__tests__/officeSessionBookingFlow.test.js',
      'src/components/schedule/__tests__/supervisionScheduler.test.js',
      'src/components/schedule/__tests__/supervisionActionDialog.test.js',
      'src/components/schedule/__tests__/supervisionNotificationSettings.test.js',
      'src/components/schedule/__tests__/AppointmentEditorShell.test.js',
      'src/components/schedule/__tests__/meetingDateReschedule.test.js',
      'src/components/schedule/__tests__/meetingTimeEntry.test.js',
      'src/components/schedule/__tests__/scheduleQuarterHourFlow.test.js',
      'src/utils/__tests__/billingNavigationAudit.test.js'
    ]
  }
});
