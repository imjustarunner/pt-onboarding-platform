export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:[
    'src/services/__tests__/qaSeededEmail.test.js',
    'src/services/__tests__/messaging.personalReminder.test.js',
    'src/services/__tests__/messaging.personalSend.test.js',
    'src/services/__tests__/messaging.secureDigestRecipient.test.js',
    'src/services/__tests__/messaging.reminderRecipient.test.js',
    'src/services/__tests__/messaging.agentDelivery.test.js',
    'src/services/__tests__/personalMailboxReplyRouting.test.js',
    'src/services/__tests__/schoolContactPlan.test.js',
    'src/services/__tests__/schoolContactAutomation.test.js',
    'src/services/__tests__/schoolContactAutomation.worker.test.js',
    'src/services/__tests__/schoolContactReplyRouting.test.js',
    'src/services/__tests__/messaging.parentContact.test.js'
  ],restoreMocks:true}
};
