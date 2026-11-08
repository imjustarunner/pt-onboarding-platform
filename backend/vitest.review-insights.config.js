export default { root: new URL('.', import.meta.url).pathname, resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } }, test: { environment: 'node', include: [
  'src/services/__tests__/clinicalNoteReviewInsights.test.js',
  'src/controllers/__tests__/clinicalNoteReviewInsights.mobile.test.js',
  'src/services/mobile/__tests__/qaScope.test.js',
  'src/services/__tests__/narrivaReview.integration.test.js'
], fileParallelism: false, testTimeout: 15000 } };
