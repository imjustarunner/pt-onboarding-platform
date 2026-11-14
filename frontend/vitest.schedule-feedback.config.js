import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/components/schedule/__tests__/AppointmentClinicalPanel.test.js',
    'src/components/schedule/__tests__/AppointmentStaffTools.test.js',
    'src/components/schedule/__tests__/AppointmentOfficeReservation.test.js',
    'src/components/schedule/__tests__/ScheduleAgencyLogo.test.js',
    'src/components/schedule/__tests__/AppointmentReminderSettings.test.js',
    'src/components/schedule/__tests__/scheduleDayLayout.test.js',
    'src/components/schedule/__tests__/scheduleOverlap.test.js',
    'src/components/schedule/__tests__/scheduleUsability.test.js',
    'src/components/schedule/__tests__/AppointmentCommunicationsPanel.test.js',
    'src/components/schedule/__tests__/AppointmentBillingPanel.test.js',
    'src/components/session-comments/__tests__/SecureSessionComments.test.js',
    'src/components/session-comments/__tests__/SecureFamilyAudience.serviceChoice.test.js',
    'src/composables/__tests__/AppointmentChangeWizard.test.js',
    'src/views/__tests__/LoginPortalIsolation.test.js',
    'src/utils/__tests__/scheduleOverlapLayout.test.js'
  ] }
};
