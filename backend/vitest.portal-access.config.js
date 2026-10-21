export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/credentialChangeNotification.test.js','src/services/__tests__/passwordChangeNotice.test.js','src/services/__tests__/hire.groupActivation.test.js','src/services/__tests__/schoolCommunicationsReady.test.js'],restoreMocks:true}
};
