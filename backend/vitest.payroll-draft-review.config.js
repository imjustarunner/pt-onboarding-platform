export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/controllers/__tests__/payrollDraftReview.test.js', 'src/models/__tests__/PayrollDraftReviewAudit.test.js'] }
};
