export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/controllers/__tests__/activityLog.supportReview.test.js', 'src/services/__tests__/auditReviewAccess.test.js', 'src/controllers/__tests__/clinicalReadAudit.test.js'], restoreMocks: true }
};
