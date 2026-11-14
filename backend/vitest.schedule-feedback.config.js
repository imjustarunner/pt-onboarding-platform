export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/manualSessionReminder.test.js',
    'src/services/__tests__/sessionReminderPolicy.test.js',
    'src/services/__tests__/sessionReminderPolicyRebuild.test.js',
    'src/services/__tests__/sessionNotificationWorker.test.js',
    'src/services/__tests__/smsConsentVerbalGate.test.js',
    'src/services/__tests__/sessionReminderDefaults.test.js',
    'src/services/__tests__/sessionCommunicationTimeline.test.js',
    'src/services/__tests__/sessionNotificationEmailReplies.test.js',
    'src/services/__tests__/familyPortalEmail.actions.test.js',
    'src/services/__tests__/scheduling.clinicalEdit.test.js',
    'src/services/__tests__/scheduling.reminderUtc.test.js',
    'src/services/__tests__/guardianCancellationReminderStop.test.js',
    'src/services/__tests__/scheduleRecordReference.test.js',
    'src/services/__tests__/guardianAccessRecovery.test.js',
    'src/services/__tests__/appointmentOfficeReservation.test.js',
    'src/services/__tests__/secureSessionComments.test.js',
    'src/services/__tests__/messaging.sharedSecureAudience.test.js',
    'src/services/__tests__/learningGuardianMessages.test.js',
    'src/services/__tests__/passwordRecovery.flow.test.js',
    'src/services/__tests__/passwordRecovery.service.test.js',
    'src/services/__tests__/appointmentStaffTools.test.js',
    'src/services/__tests__/sessionNotification.service.test.js',
    'src/services/__tests__/sessionNotification.affiliatedRecipients.test.js'
  ] }
};
