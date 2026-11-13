export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, testTimeout: 20000, hookTimeout: 30000, include: [
    'src/controllers/__tests__/publicIntakeConsentSession.test.js',
    'src/controllers/__tests__/publicIntakeProgress.test.js',
    'src/services/__tests__/enrollmentCompletion.roiGuardian.test.js',
    'src/models/__tests__/ClientSchoolRoiSigningLink.activeSession.mysql.test.js'
  ] }
};
