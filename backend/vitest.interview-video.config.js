export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/services/__tests__/hire.interview*.test.js',
    'src/services/__tests__/hire.applicantAccess.test.js',
    'src/services/__tests__/meetingCalendarGuest.test.js',
    'src/services/__tests__/meetingDialInCalendarCapacity.test.js',
    'src/services/__tests__/supervisionGuest*.test.js',
    'src/services/__tests__/interviewOpeners.test.js',
    'src/services/__tests__/interviewApplicantDetails.test.js',
    'src/utils/__tests__/meetingInterviewCalendarLink.test.js',
    'src/utils/__tests__/interviewJoinUrl.test.js'
  ] }
};
