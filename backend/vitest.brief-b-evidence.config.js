export default { root: new URL('.', import.meta.url).pathname, resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } }, test: { environment: 'node', include: [
  "src/controllers/__tests__/assignedEventDiscovery.test.js",
  "src/controllers/__tests__/publicIntakeProgress.test.js",
  "src/controllers/__tests__/publicIntakeDemographics.test.js",
  "src/controllers/__tests__/publicIntakeInsuranceReceipt.test.js",
  "src/controllers/__tests__/mobileClinical.scope.test.js",
  "src/services/__tests__/schoolSupportDraftGrounding.test.js"
], restoreMocks: true } };
