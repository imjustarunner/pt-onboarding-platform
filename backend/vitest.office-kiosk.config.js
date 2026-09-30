export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/officeClientSubmissions.service.test.js', 'src/services/__tests__/officeSameDayBooking.service.test.js', 'src/services/__tests__/officeKioskCheckin.service.test.js', 'src/services/__tests__/officeKioskDirectory.service.test.js', 'src/utils/__tests__/scheduling.recurrence.test.js', 'src/middleware/__tests__/officeKioskPublicAccess.test.js'], restoreMocks: true }
};
