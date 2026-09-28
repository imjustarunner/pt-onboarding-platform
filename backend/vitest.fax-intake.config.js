export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/services/__tests__/fax*.test.js'], restoreMocks: true }
};
