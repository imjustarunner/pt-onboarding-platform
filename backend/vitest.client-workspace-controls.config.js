export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/controllers/__tests__/clientTypeCorrections.test.js', 'src/controllers/__tests__/schoolAssignedRoiAccess.test.js'], restoreMocks: true }
};
