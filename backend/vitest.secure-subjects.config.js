export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/chatEncryption.content.test.js',
    'src/services/__tests__/hubMessageQueue.protocol.mysql.test.js',
    'src/controllers/__tests__/chat.secureSubjects.mysql.test.js',
    'src/services/__tests__/familySecureMessageAccess.mysql.test.js',
    'src/services/__tests__/messaging.secureBoundaries.test.js',
    'src/controllers/__tests__/chatPulse.unsend.test.js',
    'src/services/__tests__/messaging.hub.test.js',
    'src/services/__tests__/messaging.send.test.js',
    'src/services/__tests__/messaging.sharedSecureAudience.test.js',
    'src/services/mobile/__tests__/chat.preview.test.js'
  ] }
};
