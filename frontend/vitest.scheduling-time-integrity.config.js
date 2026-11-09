export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: [
    'src/utils/__tests__/scheduleEventInstants.test.js',
    'src/utils/__tests__/recurringWindow.test.js',
    'src/utils/__tests__/plannedOutTimezone.test.js',
    'src/utils/__tests__/calendarWallClock.test.js',
    'src/utils/__tests__/officeRequestWindows.test.js'
  ] }
};
