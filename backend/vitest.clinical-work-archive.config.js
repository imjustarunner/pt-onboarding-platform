export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/clinicalWorkArchive*.test.js',
    'src/models/__tests__/clinicalWorkArchive*.test.js',
    'src/models/__tests__/ClinicalNoteDraft.sessionReuse.test.js',
    'src/services/__tests__/billingWorkItems.test.js', 'src/services/__tests__/claimMdWorkspace.test.js',
    'src/services/__tests__/bookedSessionWork.test.js', 'src/services/__tests__/sessionClaimWindow.test.js',
    'src/services/__tests__/claimMdServiceChanges.test.js',
    'src/services/__tests__/claimMdDailyAutomation.test.js',
    'src/services/__tests__/documentationQueue.sessionScope.test.js'
  ] }
};
