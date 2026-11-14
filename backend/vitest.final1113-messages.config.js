export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',restoreMocks:true,include:[
    'src/services/__tests__/secureSessionComments.mysql.test.js',
    'src/services/__tests__/familySecureMessageAccess.mysql.test.js',
    'src/services/__tests__/learningGuardianMessages.test.js',
    'src/services/__tests__/messaging.sharedSecureAudience.test.js',
    'src/services/__tests__/familyPortalEmail.secureNotify.test.js'
  ]}
};
