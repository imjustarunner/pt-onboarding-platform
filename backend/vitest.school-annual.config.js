export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment:'node', include:['src/utils/__tests__/schoolYearUpdatePolicy.test.js','src/services/__tests__/schoolYearUpdateAutomation.test.js','src/services/__tests__/schoolYearUpdateAccess.test.js','src/services/__tests__/schoolYearUpdate.mysql.test.js','src/services/__tests__/schoolYearUpdateLinks.test.js','src/services/__tests__/schoolOnboardingWelcome.test.js'], restoreMocks:true }
};
