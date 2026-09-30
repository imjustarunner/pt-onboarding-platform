export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/services/__tests__/clientExchange*.test.js', 'src/utils/__tests__/clientCareSummary.test.js', 'src/utils/__tests__/clientExchangeSchedule.test.js', 'src/utils/__tests__/clientExchangePrivacy.test.js', 'src/services/__tests__/taskClaim.test.js', 'src/controllers/__tests__/clientExchange.test.js'], restoreMocks: true }
};
