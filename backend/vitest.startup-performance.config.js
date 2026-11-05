export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/assistantMaintenance.test.js',
    'src/services/__tests__/hire.peopleOperationsSubmissions.test.js',
    'src/services/__tests__/hire.peopleOperationsSenders.test.js',
    'src/services/__tests__/workspaceRelayClinical.test.js',
    'src/services/__tests__/dashboardIconManifest.test.js',
    'src/services/__tests__/googleOAuthRemember.test.js',
    'src/services/__tests__/calendarWorkSubscription.test.js',
    'src/services/__tests__/workspaceRelayProvisioning.test.js',
    'src/services/__tests__/libraryGooglePreview.test.js',
    'src/services/__tests__/calendarOfficePublicationSync.test.js',
    'src/services/__tests__/calendarPublicationSync.test.js',
    'src/services/__tests__/messaging.emailQuality.test.js',
    'src/controllers/__tests__/communicationFailureQueue.test.js',
    'src/utils/__tests__/securityEvidence.bootstrapHealth.test.js'
  ], restoreMocks: true }
};
