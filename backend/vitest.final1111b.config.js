export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/controllers/__tests__/publicIntakeConsentSession.test.js',
    'src/services/__tests__/secureMessageAction.test.js',
    'src/services/__tests__/schoolNotificationPresentation.test.js',
    'src/services/__tests__/schoolIntakeNotificationFeed.test.js',
    'src/services/__tests__/clientPortalEmail.schoolIdentity.test.js',
    'src/services/__tests__/familyPortalEmail.content.test.js',
    'src/services/__tests__/familyPortalEmail.secureNotify.test.js'
  ] }
};
