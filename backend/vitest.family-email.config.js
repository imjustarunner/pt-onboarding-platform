export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/guardianNotificationSetup.test.js','src/services/__tests__/messaging.sharedSecureAudience.test.js','src/services/__tests__/guardianAccess.sharedMessages.test.js','src/**/__tests__/familyPortalEmail.*.test.js','src/services/__tests__/messaging.outboundSignature.test.js'],restoreMocks:true}
};
