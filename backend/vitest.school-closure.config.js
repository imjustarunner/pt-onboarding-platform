export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/schoolClosureNotification.test.js', 'src/services/__tests__/schoolClosureDelivery.test.js', 'src/services/__tests__/schoolClosureDashboard.test.js', 'src/services/__tests__/schoolDayClosures.test.js', 'src/services/__tests__/districtCalendarDates.test.js', 'src/services/__tests__/providerUpdateNotificationChannels.test.js'], restoreMocks: true }
};
