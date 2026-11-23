export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/importedGuardianNotifications.test.js',
    'src/services/__tests__/importedGuardianSmsGate.test.js',
    'src/services/__tests__/clientSmsStartConsent.test.js',
    'src/services/__tests__/clientSmsStartIntegration.test.js',
    'src/services/__tests__/smsPhoneEnrollment.test.js',
    'src/services/__tests__/messaging.familySmsConfirmation.test.js',
    'src/services/__tests__/familyPortalEmail.notificationChoices.test.js',
    'src/services/__tests__/familyPortalEmail.notificationPage.test.js',
    'src/services/__tests__/messaging.compliance.test.js',
    'src/services/__tests__/guardianNotificationSetup.test.js',
    'src/services/__tests__/guardianReminderPreferences.test.js',
    'src/services/__tests__/contactReminderSmsConsent.test.js',
    'src/services/__tests__/contactReminderSmsKeyword.schema.test.js',
    'src/services/__tests__/sessionNotification.affiliatedRecipients.test.js',
    'src/services/__tests__/schoolAppointmentNotifications.test.js'
  ] }
};
