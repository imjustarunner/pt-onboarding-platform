export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/schoolContactAutomation.worker.test.js','src/services/__tests__/schoolContactStaffEmail.test.js','src/services/__tests__/schoolContactProviderNotice.test.js','src/services/__tests__/messaging.schoolContactSend.test.js','src/services/__tests__/messaging.personalSend.test.js'],restoreMocks:true}
};
