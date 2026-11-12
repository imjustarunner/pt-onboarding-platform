export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/routes/__tests__/communicationPrefsRouting.test.js',
    'src/routes/__tests__/userAdminDocsRouting.test.js',
    'src/controllers/__tests__/messageRecent.test.js',
    'src/controllers/__tests__/providerServicesDirectory.test.js'
  ] }
};
