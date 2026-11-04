export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/copayReceipts.test.js','src/services/__tests__/clientSupportReceipts.test.js','src/services/__tests__/billingSenderMembers.test.js','src/services/__tests__/billingSenderProvisioning.test.js','src/services/__tests__/receiptDeliveryRetry.test.js','src/services/__tests__/communicationRecordDelivery.test.js'],restoreMocks:true}
};
