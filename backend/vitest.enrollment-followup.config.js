export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/enrollmentReminderDelivery.test.js', 'src/services/__tests__/intakeUnfinishedReminder.delivery.test.js', 'src/services/__tests__/enrollmentCompletion.privacy.test.js'], restoreMocks: true }
};
