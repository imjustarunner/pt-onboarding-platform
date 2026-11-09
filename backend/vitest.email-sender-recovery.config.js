export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node', restoreMocks: true, maxWorkers: 1,
    include: [
      'src/services/__tests__/hire.onboardingInvite.test.js',
      'src/services/__tests__/hire.prehireInvite.test.js',
      'src/services/__tests__/hire.peopleOperationsSenders.test.js',
      'src/services/__tests__/messaging.senderSelection.test.js',
      'src/services/__tests__/messaging.verifiedSender.test.js',
      'src/services/__tests__/emailAliasRecovery.test.js',
      'src/services/__tests__/familyPortalEmail.transportRetry.test.js'
    ]
  }
};
