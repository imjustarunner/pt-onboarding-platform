export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/utils/__tests__/transitionWeekPolicy.test.js',
    'src/utils/__tests__/transitionWeekVideo.test.js',
    'src/services/__tests__/transitionWeek.test.js',
    'src/services/__tests__/smsPhoneEnrollment.test.js',
    'src/controllers/__tests__/transitionWeekAccess.test.js',
    'src/services/__tests__/scheduling.clientSessionBookingRollout.test.js',
    'src/services/__tests__/scheduling.transitionWeekCohort.test.js',
    'src/services/__tests__/messaging.smsEnrollment.test.js',
    'src/services/__tests__/messaging.compliance.test.js',
    'src/services/__tests__/contactReminderSmsConsent.test.js'
  ] }
};
