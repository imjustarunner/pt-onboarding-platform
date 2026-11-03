export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
 'src/services/__tests__/messaging.providerSmsRelay*.test.js',
 'src/services/__tests__/messaging.smsCommunicationNotice.test.js',
 'src/services/__tests__/messaging.communicationCoverage.test.js',
 'src/services/__tests__/messaging.outOfOffice.test.js',
 'src/services/__tests__/messaging.requestedSupport.test.js',
 'src/services/__tests__/messaging.sharedCareSend.test.js',
 'src/services/__tests__/messaging.communicationSharedNumber.test.js',
 'src/services/__tests__/messaging.communicationReception.test.js',
 'src/services/__tests__/messaging.smsCarrierBoundary.test.js',
 'src/services/__tests__/messaging.carrierCompliance.test.js',
 'src/services/__tests__/messaging.smsAbsence.test.js',
 'src/controllers/__tests__/messaging.smsCarrierInbound.test.js'
 ],restoreMocks:true}
};
