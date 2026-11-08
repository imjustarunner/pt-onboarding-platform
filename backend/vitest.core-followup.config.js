export default { root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/schoolRoiGuardianConsent.test.js',
    'src/services/__tests__/briefBPolicies.test.js',
    'src/services/__tests__/schoolRoiGuardians.mysql.test.js',
    'src/services/__tests__/schoolRoiGuardianRequests.test.js',
    'src/services/__tests__/guardianConsentUpdateRequests.test.js',
    'src/services/__tests__/guardianSchoolAffiliations.test.js',
    'src/services/__tests__/schoolContactStaffEmail.test.js',
    'src/services/__tests__/schoolSupportDraftGrounding.test.js',
    'src/services/__tests__/clientUpdateAccess.test.js',
    'src/services/__tests__/clientUpdateDeliveryGate.test.js',
    'src/services/__tests__/clinicalDraftSessionContext.test.js',
    'src/services/__tests__/intakeAuthorization.test.js',
    'src/services/__tests__/enrollmentCompletion.roiDownload.test.js',
    'src/controllers/__tests__/publicIntakeSchoolSummary.test.js'
  ], restoreMocks: true } };
