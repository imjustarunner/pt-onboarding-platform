import path from 'node:path';
export default {
  root:path.resolve(import.meta.dirname),
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:['src/services/__tests__/billingTransactionFilters.test.js','src/services/__tests__/claimMdWorkspace.test.js','src/services/__tests__/billingWorkItems.test.js','src/services/__tests__/billingWorkItems.mysql.test.js','src/services/__tests__/claimMdBillingProfile.test.js','src/services/__tests__/medicalBillingReports.test.js','src/controllers/__tests__/claimMdBillingOffice.test.js','src/controllers/__tests__/claimMdClinicalVersions.test.js'],restoreMocks:true}
};
