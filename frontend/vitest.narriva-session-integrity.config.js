export default {
 root:new URL('.',import.meta.url).pathname,
 test:{environment:'jsdom',include:['src/utils/__tests__/noteAidSessionIntegrity.test.js','src/utils/__tests__/noteAidWorkQueueLibrary.test.js','src/utils/__tests__/noteAidBillingAddons.test.js'],restoreMocks:true}
};
