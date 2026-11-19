export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/controllers/__tests__/departmentalTicketClaim.test.js',
    'src/services/__tests__/supportTicketRead.test.js',
    'src/services/__tests__/messagesHubSender.test.js',
    'src/services/__tests__/messaging.hub.test.js'
  ] }
};
