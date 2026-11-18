export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/calendarPerformance.mysql.test.js',
    'src/services/__tests__/scheduling.dayAbsencePolicy.test.js',
    'src/services/__tests__/schoolAppointmentTransition.test.js',
    'src/services/__tests__/scheduling.schoolRosterCancellation.test.js',
    'src/services/__tests__/privateMailboxAccess.test.js'
  ] }
};
