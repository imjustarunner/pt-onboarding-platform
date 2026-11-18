export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', restoreMocks: true, include: [
    'src/services/__tests__/scheduling.timezoneAudit.test.js',
    'src/models/__tests__/scheduling.calendarWeek.test.js',
    'src/services/__tests__/scheduling.appointmentVideoPolicy.test.js',
    'src/services/__tests__/scheduling.clinicalEdit.test.js',
    'src/services/__tests__/scheduling.publicAvailability.test.js',
    'src/services/__tests__/scheduling.ownedOfficeSession.test.js',
    'src/services/__tests__/meetingScheduleTimezone.test.js',
    'src/services/__tests__/supervisionRecurrenceEdit.test.js',
    'src/services/__tests__/supervisionReschedule.test.js',
    'src/services/__tests__/calendarPublication.test.js',
    'src/services/__tests__/calendarPublicationSync.test.js',
    'src/controllers/__tests__/supervisionBooking.test.js',
    'src/controllers/__tests__/appointmentClinicalWriteAccess.test.js',
    'src/controllers/__tests__/scheduling.companyEventsCalendar.test.js'
  ] }
};
