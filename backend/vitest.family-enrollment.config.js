export default { test: { environment: 'node', include: [
  'src/services/__tests__/guardianEnrollmentStart.test.js',
  'src/services/__tests__/familyPortalEmail.coGuardianAccounts.test.js',
  'src/services/__tests__/enrollmentSubmissionRoster.test.js',
  'src/services/__tests__/clientEnrollmentMerge.test.js',
  'src/services/__tests__/familyEnrollment.mysql.test.js',
  'src/services/__tests__/enrollmentCompletion.coGuardianBinding.mysql.test.js',
  'src/services/__tests__/schoolGuardianPolicy.provisioning.test.js',
  'src/services/__tests__/coGuardianResume.test.js',
  'src/services/__tests__/enrollmentCompletion.guardianInvites.test.js',
  'src/controllers/__tests__/enrollmentCompletion.coGuardianRetry.test.js',
  'src/controllers/__tests__/enrollmentCompletion.coGuardianIntegrity.test.js'
], testTimeout: 15000 } };
