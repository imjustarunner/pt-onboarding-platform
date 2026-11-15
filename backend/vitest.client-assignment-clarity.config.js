export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    env: { SKIP_DB_CONNECT: '1' },
    restoreMocks: true,
    include: [
      'src/services/__tests__/clientServiceContext.test.js',
      'src/services/__tests__/providerServiceCaseload.test.js',
      'src/services/__tests__/dependentPortalInvitations.test.js',
      'src/services/__tests__/dependentPortalPolicy.test.js',
      'src/services/__tests__/clientAssignmentScope.test.js',
      'src/services/__tests__/clientServiceUnification.test.js',
      'src/services/__tests__/guardianCancellationServiceStatus.test.js',
      'src/controllers/__tests__/guardianServiceStatusAccess.test.js',
      'src/services/__tests__/officeClientAssignmentClarity.test.js',
      'src/services/__tests__/chartSetupSchoolParity.test.js',
      'src/services/__tests__/officeProviderScope.test.js',
      'src/services/__tests__/clientBookingDefaultsSync.test.js',
      'src/controllers/__tests__/schoolProviderAssignment.test.js',
      'src/services/__tests__/clientServiceEnrollment.test.js'
    ]
  }
};
