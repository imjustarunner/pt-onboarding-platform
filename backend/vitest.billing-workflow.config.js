export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/claimMdWorkspace.test.js','src/services/__tests__/billingWorkItems.test.js','src/services/__tests__/billingWorkItems.mysql.test.js','src/services/__tests__/coverageAdmission.assignments.test.js','src/services/__tests__/claimResubmission.test.js','src/services/__tests__/claimRecoveryResult.test.js','src/services/__tests__/billingNavigationAudit.test.js','src/services/__tests__/claimMdSubmission.test.js','src/controllers/__tests__/claimMdClinicalVersions.test.js','src/controllers/__tests__/claimMdOriginalSigning.test.js','src/controllers/__tests__/schoolProviderAssignment.test.js','src/services/__tests__/clientExchangeClaims.test.js','src/services/__tests__/clientExchangePosting.test.js'],restoreMocks:true}
};
