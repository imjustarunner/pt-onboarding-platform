export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node', restoreMocks: true,
    include: [
      'src/services/__tests__/messaging.smsCarrierBoundary.test.js',
      'src/controllers/__tests__/messaging.smsCarrierInbound.test.js',
      'src/services/__tests__/messaging.compliance.test.js',
      'src/services/__tests__/messaging.carrierCompliance.test.js',
      'src/services/__tests__/messaging.vonageTransport.test.js',
      'src/services/__tests__/messaging.smsEnrollment.test.js',
      'src/services/__tests__/messaging.familySmsConfirmation.test.js',
      'src/services/__tests__/messaging.staffSmsConfirmation.test.js',
      'src/services/__tests__/messaging.smsInventory.test.js',
      'src/routes/__tests__/enrollmentCompletion.notifyreWebhook.test.js',
      'src/utils/__tests__/enrollmentCompletion.policy.test.js',
      'src/routes/__tests__/vonageMount.test.js'
    ]
  }
};
