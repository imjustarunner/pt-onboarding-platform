export default { root: new URL('.', import.meta.url).pathname,
resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
test: { environment: 'node', include: [
  'src/services/__tests__/workspaceRelay*.test.js',
  'src/services/__tests__/messaging.verifiedSender.test.js',
  'src/services/__tests__/messaging.transportMailbox.test.js',
  'src/services/__tests__/activityProtection.transport.test.js'
], restoreMocks: true } };
