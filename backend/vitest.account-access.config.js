export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node', restoreMocks: true,
    include: [
      'src/services/__tests__/accountAccess.test.js',
      'src/services/__tests__/schoolOnboarding.accountAccess.test.js',
      'src/middleware/__tests__/accountAccess.test.js',
      'src/controllers/__tests__/accountAccess.test.js',
      'src/services/__tests__/hire.loginGate.test.js',
      'src/services/__tests__/quickViewSession.test.js',
      'src/services/__tests__/passkeys.controller.test.js',
      'src/controllers/__tests__/passwordRecovery.test.js',
      'src/controllers/__tests__/employeeLoginRouting.test.js',
      'src/middleware/__tests__/supervisionPresenceAuthentication.test.js',
      'src/middleware/__tests__/officeKioskPublicAccess.test.js'
    ]
  }
};
