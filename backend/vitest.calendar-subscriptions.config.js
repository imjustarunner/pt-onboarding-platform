export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: [
      'src/services/__tests__/calendar*.test.js',
      'src/services/__tests__/scheduleCalendarPolicy.test.js',
      'src/services/__tests__/googleScheduleAccess.test.js',
      'src/services/__tests__/scheduling.agencyAvailability.test.js',
      'src/services/__tests__/scheduling.publicAvailability.test.js',
      'src/services/__tests__/scheduling.calendarSync.test.js',
      'src/services/__tests__/meetingInvitations*.test.js',
      'src/services/__tests__/meetingCalendarEmail.test.js'
    ],
    restoreMocks: true
  }
};
