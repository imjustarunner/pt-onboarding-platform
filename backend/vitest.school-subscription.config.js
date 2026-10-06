export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/schoolPortalEmail.mysql.test.js', 'src/services/__tests__/schoolPortalEmail.test.js', 'src/services/__tests__/schoolGroupSubscription.test.js', 'src/services/__tests__/googleWorkspaceDirectory.delivery.test.js'] }
};
