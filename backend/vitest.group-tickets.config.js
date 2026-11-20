export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/controllers/__tests__/departmentalTicketClaim.test.js',
    'src/controllers/__tests__/supportTicketDraft.test.js',
    'src/services/__tests__/messaging.departmentalGroups.test.js',
    'src/services/__tests__/messaging.departmentalBackfill.test.js',
    'src/services/__tests__/messaging.managedGroups.test.js',
    'src/services/__tests__/messaging.managedGroupSync.test.js',
    'src/services/__tests__/messaging.hub.test.js',
    'src/services/__tests__/messagesHubSender.test.js',
    'src/services/__tests__/enrollmentCompletion.groupOwnership.test.js',
    'src/services/__tests__/googleWorkspaceDirectory.delivery.test.js',
    'src/services/__tests__/departmentalSenderReadiness.test.js',
    'src/services/__tests__/workspaceRelay.test.js',
    'src/services/__tests__/workspaceRelayProvisioning.test.js',
    'src/services/__tests__/technologySupport.test.js',
    'src/services/__tests__/privateMailboxAccess.test.js',
    'src/services/__tests__/schoolOnboardingReminders.test.js',
    'src/services/__tests__/messaging.groupRouting.test.js',
    'src/services/__tests__/messaging.agentDelivery.test.js',
    'src/services/__tests__/accountSecurityMailRouting.test.js',
    'src/services/__tests__/sharedInboxTicketArchive.mysql.test.js',
    'src/services/__tests__/messaging.personalImport.test.js'
  ], restoreMocks: true }
};
