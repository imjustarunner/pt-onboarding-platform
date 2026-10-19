export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/quickView*.test.js', 'src/services/__tests__/credentialChangeNotification.test.js', 'src/services/__tests__/passwordChangeNotice.test.js', 'src/services/__tests__/scheduling.providerUpdateReview.test.js', 'src/services/__tests__/providerUpdateProgress.test.js'], restoreMocks: true }
};
