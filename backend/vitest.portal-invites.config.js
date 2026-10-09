export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/portalSetupBranding.test.js', 'src/services/__tests__/clientPortalContext.test.js', 'src/services/__tests__/guardianReminderPreferences.test.js', 'src/services/__tests__/portalInvitationEmail.test.js', 'src/services/__tests__/clientPortalInvites.test.js', 'src/services/__tests__/guardianNotificationSetup.test.js'], restoreMocks: true }
};
