export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',include:[
 'src/services/__tests__/clientPaymentFollowup.test.js',
 'src/services/__tests__/guardianInsuranceReadiness.test.js',
 'src/services/__tests__/guardianInsuranceReadiness.mysql.test.js',
 'src/services/__tests__/clientPaymentSetup.test.js',
 'src/services/__tests__/clientAccountSupportBalance.test.js',
 'src/services/__tests__/claimMdCareSummary.test.js',
 'src/services/__tests__/appointmentBillingAccess.test.js',
 'src/services/__tests__/claimMdCareAccess.test.js',
 'src/controllers/__tests__/insuranceVerificationWorkspace.test.js'
],testTimeout:20000}};
