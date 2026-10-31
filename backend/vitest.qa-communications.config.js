export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/controllers/__tests__/supportTicketDraft.test.js','src/routes/__tests__/providerImportAdministration.test.js'] }
};
