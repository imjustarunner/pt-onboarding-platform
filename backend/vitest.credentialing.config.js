export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/__tests__/credentialing*.test.js', 'src/**/__tests__/superviseePayer*.test.js', 'src/**/__tests__/scheduling.kimiPaymentAndShare.test.js'], restoreMocks: true }
};
