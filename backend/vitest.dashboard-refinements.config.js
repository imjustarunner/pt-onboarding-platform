export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/scheduleSummaryPrivacy.service.test.js',
    'src/services/__tests__/trainingRegistrationPolicy.test.js',
    'src/services/__tests__/meetingUpcomingInvitations.test.js',
    'src/services/__tests__/supervisionRsvpSms.test.js',
    'src/services/__tests__/supervisionEmailDelivery.test.js',
    'src/services/__tests__/meetingSupervisionReminders.test.js',
    'src/services/__tests__/scheduledTraining*.test.js',
    'src/services/__tests__/meetingSettingsPolicy.test.js',
    'src/controllers/__tests__/staffDirectory.test.js'
  ], restoreMocks: true }
};
