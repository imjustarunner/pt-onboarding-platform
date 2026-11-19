export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/utils/__tests__/profileAssignmentOrganizations.test.js'], restoreMocks: true }
};
