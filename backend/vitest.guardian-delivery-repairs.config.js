export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/clientPortalInvites.test.js',
    'src/services/__tests__/enrollmentCompletion.guardianInvites.test.js',
    'src/services/__tests__/messagesHub.selectedInvite.test.js',
    'src/services/__tests__/coGuardianRequestOrigin.mysql.test.js',
    'src/services/__tests__/coGuardianSelectedRetry.mysql.test.js',
    'src/services/__tests__/coGuardianReminders.mysql.test.js'
  ] }
};
