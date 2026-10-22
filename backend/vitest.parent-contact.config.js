export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/messaging.parentContact*.test.js','src/services/__tests__/messaging.senderMailbox.test.js','src/services/__tests__/messaging.ssoCopy.test.js','src/services/__tests__/personalMailboxReplyRouting.test.js','src/services/__tests__/messaging.outboundSignature.test.js','src/services/__tests__/messaging.peopleScope.mysql.test.js'],restoreMocks:true}
};
