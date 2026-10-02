export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/staffCareEligibility.test.js',
    'src/services/__tests__/bachelorsServiceCodePolicy.test.js',
    'src/services/__tests__/scheduling.careEligibility.test.js',
    'src/services/__tests__/scheduling.selfPayBooking.test.js',
    'src/services/__tests__/providerServiceOfferings.test.js',
    'src/services/__tests__/providerAgencyAvailability.test.js',
    'src/controllers/__tests__/staffTenantCards.test.js'
  ], restoreMocks: true }
};
