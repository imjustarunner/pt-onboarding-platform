export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/controllers/__tests__/dashboardIcons.test.js', 'src/utils/__tests__/dashboardRailOrder.test.js', 'src/models/__tests__/dashboardRailPreferences.test.js'], restoreMocks: true }
};
