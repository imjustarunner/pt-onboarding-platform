export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/superviseeWorkspace.test.js', 'src/services/__tests__/superviseeWorkspaceAssignments.test.js', 'src/controllers/__tests__/superviseeWorkspaceAccess.test.js'] }
};
