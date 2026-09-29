export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/routes/__tests__/accountability.test.js'], restoreMocks: true }
};
