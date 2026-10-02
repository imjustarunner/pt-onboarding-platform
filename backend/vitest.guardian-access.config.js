export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/**/__tests__/guardianAccess.*.test.js'], restoreMocks: true }
};
