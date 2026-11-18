export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,include:[
  'src/services/__tests__/schoolRoiGuardianRequests.test.js',
  'src/services/__tests__/schoolRoiRequestEmail.test.js',
  'src/services/__tests__/schoolRoiGuardianConsent.test.js',
  'src/services/__tests__/familyQuickTextEnrollment.test.js',
  'src/services/__tests__/familyPortalEmail.notificationPage.test.js',
  'src/services/__tests__/familyPortalEmail.notificationChoices.test.js',
  'src/services/__tests__/clientSmsStartConsent.test.js',
  'src/services/__tests__/clientSmsStartIntegration.test.js',
  'src/services/__tests__/messaging.compliance.test.js',
  'src/utils/__tests__/assignedSmartDisclosure.test.js',
  'src/services/__tests__/guardianWorkspace.test.js',
  'src/services/__tests__/guardianSignaturePreview.test.js',
  'src/controllers/__tests__/publicIntakeConsentSession.test.js'
 ]}
};
