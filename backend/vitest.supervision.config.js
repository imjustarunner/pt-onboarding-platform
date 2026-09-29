export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: ['src/services/__tests__/supervisionHistory.access.test.js', 'src/utils/__tests__/agencyFeatureFlags.test.js'],
    restoreMocks: true
  }
};
