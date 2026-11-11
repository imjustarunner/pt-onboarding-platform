export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',include:['src/services/__tests__/schoolAppointmentTransition.test.js','src/services/__tests__/schoolAppointmentTransition.mysql.test.js','src/services/__tests__/scheduling.dayAbsencePolicy.test.js','src/services/__tests__/schoolWeeklyBooking.test.js','src/controllers/__tests__/schoolWeeklyBooking.test.js','src/services/__tests__/scheduling.appointmentWriteGuard.test.js','src/services/__tests__/scheduling.calendarSync.test.js','src/services/__tests__/scheduling.clinicalEdit.test.js','src/controllers/__tests__/appointmentClinicalWriteAccess.test.js'],restoreMocks:true}
};
