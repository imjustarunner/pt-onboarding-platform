export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/**/__tests__/managedBillingScope.test.js', 'src/services/__tests__/schoolAppointmentNotifications.test.js', 'src/services/__tests__/sessionNotification.service.test.js', 'src/**/__tests__/agencyArchive.test.js', 'src/**/__tests__/scheduling.billingAccess.test.js', 'src/**/__tests__/claimMdWorkspace.test.js'], restoreMocks: true }
};
