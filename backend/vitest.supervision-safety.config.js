export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/supervisionEmail*.test.js',
    'src/services/__tests__/supervisionAttendancePolicy.test.js',
    'src/services/__tests__/supervisionRecurrenceEdit.test.js',
    'src/services/__tests__/supervisionReschedule.test.js',
    'src/services/__tests__/supervisionRsvp*.test.js',
    'src/services/__tests__/family.service.test.js',
    'src/utils/__tests__/meetingAudienceGroups.test.js',
    'src/utils/__tests__/scheduleCoworkerRoles.test.js',
    'src/controllers/__tests__/meetingAudienceScope.test.js',
    'src/controllers/__tests__/supervisionBooking.test.js',
    'src/services/__tests__/meetingInvitations.test.js',
    'src/utils/__tests__/supervisionParticipantDetails.test.js',
    'src/models/__tests__/workplacePeople.test.js',
    'src/models/__tests__/supervisionSeriesScope.test.js'
  ], restoreMocks: true }
};
