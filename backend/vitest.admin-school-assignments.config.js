export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', env: { SKIP_DB_CONNECT: '1', SKIP_CLINICAL_DB_CONNECT: '1' }, restoreMocks: true,
    include: ['src/controllers/__tests__/providerSelfAffiliations.test.js', 'src/controllers/__tests__/adminSchoolAssignments.mysql.test.js', 'src/controllers/__tests__/clientManagementProviders.test.js', 'src/controllers/__tests__/providerScheduling.assignable.test.js'] }
};
