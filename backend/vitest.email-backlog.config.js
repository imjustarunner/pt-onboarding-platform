export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, maxWorkers: 1, include: [
    'src/services/__tests__/enrollmentCompletion.confirmation.test.js',
    'src/services/__tests__/enrollmentReceipt.setup.test.js',
    'src/services/__tests__/enrollmentCompletion.portalBranding.test.js',
    'src/services/__tests__/schoolEmailPortal.test.js'
  ] }
};
