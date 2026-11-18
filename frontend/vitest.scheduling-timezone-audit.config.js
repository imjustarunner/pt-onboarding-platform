import virtualBooking from './vitest.virtual-session-booking.config.js';
export default {
  ...virtualBooking,
  root: new URL('.', import.meta.url).pathname,
  test: { ...virtualBooking.test, include: [...virtualBooking.test.include,
    'src/utils/__tests__/scheduleEventInstants.test.js',
    'src/utils/__tests__/plannedOutTimezone.test.js',
    'src/utils/__tests__/officeRequestWindows.test.js',
    'src/utils/__tests__/recurringWindow.test.js',
    'src/utils/__tests__/providerUpdateCalendar.test.js',
    'src/components/schedule/__tests__/scheduleBlocks.test.js',
    'src/components/schedule/__tests__/supervisionScheduler.test.js',
    'src/components/schedule/__tests__/schoolSoftCalendar.test.js'
  ] }
};
