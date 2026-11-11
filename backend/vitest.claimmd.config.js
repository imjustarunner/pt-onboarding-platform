export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/narrivaSubmissionReview.test.js', 'src/services/__tests__/syntheticClearinghouseGuard.test.js', 'src/controllers/__tests__/clinicalReadAudit.test.js', 'src/services/__tests__/nonbillableNoteCompletion.test.js', 'src/services/__tests__/scheduling.claimReadiness.test.js', 'src/**/__tests__/claimMd*.test.js', 'src/services/__tests__/eligibilityAutomation.test.js', 'src/**/__tests__/noteAidPlannedClaim*.test.js'], restoreMocks: true, unstubEnvs: true }
};
