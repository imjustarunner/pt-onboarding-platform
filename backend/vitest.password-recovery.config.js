export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/passwordRecovery*.test.js', 'src/controllers/__tests__/schoolStaffRecovery.test.js', 'src/models/__tests__/passwordRecoveryToken.test.js'], restoreMocks: true }
};
