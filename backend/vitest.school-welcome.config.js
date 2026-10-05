export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/schoolOnboardingWelcome.test.js', 'src/services/__tests__/technologySupport.test.js', 'src/services/__tests__/schoolWelcome.mysql.test.js'], restoreMocks: true }
};
