export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/internalReferrals.test.js','src/services/__tests__/clientExchange*.test.js','src/controllers/__tests__/clientExchange.test.js','src/utils/__tests__/clientExchange*.test.js','src/services/__tests__/meetingSummaryContent.test.js','src/services/__tests__/meetingSummaryJobs.test.js','src/services/__tests__/myMeetings.test.js','src/services/__tests__/sameDayServiceWarning.test.js'], exclude: ['src/utils/__tests__/clientExchangeMatching.test.js'], restoreMocks: true }
};
