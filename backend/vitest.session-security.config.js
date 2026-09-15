export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/**/__tests__/sessionSecurity*.test.js'], restoreMocks: true }
};
