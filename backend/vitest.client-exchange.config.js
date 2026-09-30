export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/services/__tests__/clientExchangeNotifications.test.js', 'src/controllers/__tests__/clientExchange.test.js'], restoreMocks: true }
};
