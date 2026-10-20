export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/providerUpdateCompletionEmail.test.js',
    'src/services/__tests__/providerUpdateEmailSender.test.js',
    'src/services/__tests__/providerUpdateProgress.test.js',
    'src/services/__tests__/providerUpdateRecords.test.js',
    'src/controllers/__tests__/providerUpdateCompletion.test.js',
    'src/services/__tests__/messaging.outboundSignature.test.js'
  ]}
};
