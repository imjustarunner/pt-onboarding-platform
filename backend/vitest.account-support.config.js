export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/__tests__/clientAccountSupport*.test.js','src/controllers/__tests__/clientInsuranceSupport.test.js','src/controllers/__tests__/clientInsuranceSources.test.js','src/services/__tests__/managedBillingScope.test.js','src/services/__tests__/scheduling.billingAccess.test.js'], restoreMocks: true }
};
