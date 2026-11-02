export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/clinicalIntegration.*.test.js',
    'src/services/__tests__/messaging.emailQuality.test.js',
    'src/services/__tests__/scheduling.careEligibility.test.js',
    'src/services/__tests__/scheduling.reminderUtc.test.js',
    'src/services/__tests__/schoolAppointmentNotifications.test.js',
    'src/services/__tests__/guardianReminderPreferences.test.js'
  ], restoreMocks: true }
};
