export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/__tests__/scheduling.*.test.js', 'src/services/__tests__/scheduleSummaryPrivacy.service.test.js', 'src/controllers/__tests__/providerUpdateRoomRequest.test.js'], restoreMocks: true }
};
