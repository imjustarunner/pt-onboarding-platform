export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/clientTotalsHygiene.test.js',
    'src/services/__tests__/referralTotals.test.js',
    'src/controllers/__tests__/referralTotals.test.js',
    'src/services/__tests__/clientReactivation.test.js',
    'src/services/__tests__/clientReactivationIntegrations.test.js',
    'src/controllers/__tests__/publicIntakeInsuranceReceipt.test.js',
    'src/controllers/__tests__/publicIntakeDemographics.test.js',
    'src/services/__tests__/clientInactiveScheduling.test.js'
  ] }
};
