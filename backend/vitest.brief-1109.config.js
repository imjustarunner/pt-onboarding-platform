export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/paperPacketTask.test.js',
    'src/services/__tests__/referralPacketMatch.test.js',
    'src/controllers/__tests__/paperPacketTaskAccess.test.js',
    'src/services/__tests__/schoolContactAutomation.test.js',
    'src/services/__tests__/qaIntakeIdentity.test.js',
    'src/services/__tests__/clientContactAffiliation.schema.test.js',
    'src/services/__tests__/sessionNotification.affiliatedRecipients.test.js',
    'src/services/__tests__/treatmentPlanCalendarDate.test.js',
    'src/controllers/__tests__/enrollmentCompletion.coGuardianRetry.test.js'
  ] }
};
