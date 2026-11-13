export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/utils/__tests__/schoolRoiEvidence.test.js', 'src/controllers/__tests__/schoolRoiEvidence.test.js',
    'src/models/__tests__/signedSchoolRoiClientScope.test.js', 'src/models/__tests__/schoolRoiEvidence.mysql.test.js', 'src/services/__tests__/schoolRoiGuardianRequests.test.js',
    'src/services/__tests__/schoolCommunicationsReady.test.js'
  ] }
};
