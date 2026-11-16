export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:[
    'src/services/__tests__/billingOperations.test.js',
    'src/services/__tests__/taskAssignmentNotification.test.js',
    'src/services/__tests__/taskPushNavigation.test.js',
    'src/services/__tests__/remittanceSearch.test.js',
    'src/services/__tests__/payerSetupCatalog.test.js',
    'src/services/__tests__/credentialingPayerCatalog.test.js',
    'src/services/__tests__/billingWorkItems.test.js',
    'src/services/__tests__/sessionClaimWindow.test.js',
    'src/services/__tests__/claimMdContentReview.test.js',
    'src/services/__tests__/claimMdSupervision.test.js',
    'src/services/__tests__/claimMdWorkspace.test.js',
    'src/controllers/__tests__/claimMdReviewSnapshot.test.js',
    'src/controllers/__tests__/claimMdBillingOffice.test.js'
  ],restoreMocks:true,unstubEnvs:true}
};
