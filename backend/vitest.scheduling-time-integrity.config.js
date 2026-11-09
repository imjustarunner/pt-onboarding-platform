export default {
  root: new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:[
    'src/services/__tests__/scheduling.workerGate.test.js',
    'src/services/__tests__/scheduling.workerCalendarRoundTrip.test.js',
    'src/controllers/__tests__/supervisionBooking.test.js',
    'src/controllers/__tests__/officeRescheduleTimezone.test.js',
    'src/services/__tests__/scheduling.officeMove.test.js',
    'src/services/__tests__/recurringScheduleWindow.test.js',
    'src/services/__tests__/supervisionRecurrenceEdit.test.js',
    'src/services/__tests__/supervisionReschedule.test.js',
    'src/services/__tests__/meetingScheduleTimezone.test.js',
    'src/services/__tests__/meetingCalendarEmail.test.js',
    'src/services/__tests__/scheduling.calendarSync.test.js'
  ],restoreMocks:true}
};
