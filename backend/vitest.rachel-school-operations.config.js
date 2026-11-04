export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,include:[
  'src/services/__tests__/rachelInsuranceSemantics.test.js',
  'src/services/__tests__/superviseePayerEligibility.test.js',
  'src/services/__tests__/credentialingPayerCatalog.test.js',
  'src/services/__tests__/providerAvailabilityRoster.test.js',
  'src/services/__tests__/schoolStaffingWaitlists.test.js',
  'src/services/__tests__/schoolAffiliations.test.js',
  'src/controllers/__tests__/schoolStaffingWaitlists.test.js',
  'src/services/__tests__/clientExchangeEligibility.test.js'
 ]}
};
