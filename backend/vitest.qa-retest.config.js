export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/guardianReminderPreferences.test.js','src/services/__tests__/familyPortalLocale.test.js','src/services/__tests__/passwordRecovery.flow.test.js','src/services/__tests__/guardianEnrollmentCopies.test.js','src/services/__tests__/guardianAppointmentAccess.test.js','src/services/__tests__/guardianCancellation.test.js','src/services/__tests__/guardianSessionBooking.test.js'], restoreMocks: true }
};
