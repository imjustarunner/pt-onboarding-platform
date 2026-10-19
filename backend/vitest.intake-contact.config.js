export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/controllers/__tests__/clientGuardianContact.test.js',
    'src/models/__tests__/clientGuardianIntakeProfile.test.js',
    'src/services/__tests__/schoolPacketSections*.test.js',
    'src/services/__tests__/enrollmentFoundations.test.js'
  ], restoreMocks: true }
};
