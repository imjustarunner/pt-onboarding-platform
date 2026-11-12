export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/models/__tests__/IntakeSubmissionDocument.count.test.js',
    'src/controllers/__tests__/unassignedDocuments.summary.test.js'
  ] }
};
