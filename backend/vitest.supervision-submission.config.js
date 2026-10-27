export default {
 root: new URL('.', import.meta.url).pathname,
 resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
 test: { environment: 'node', include: [
  'src/controllers/__tests__/manualSupervisionContinuation.test.js',
  'src/controllers/__tests__/supervisionPayrollSubmissionAccess.test.js',
  'src/models/__tests__/supervisionCompensableMap.test.js',
  'src/services/__tests__/supervisionSubmissionPolicy.test.js',
  'src/services/__tests__/supervisionAttendancePolicy.test.js',
  'src/services/__tests__/hourlySupervisionPay.test.js',
  'src/services/__tests__/supervisionUnpaidHours.test.js',
  'src/controllers/__tests__/supervisionPayrollRates.test.js',
  'src/services/__tests__/supervisionEmail.test.js',
  'src/services/__tests__/supervisionEmailDelivery.test.js'
 ] }
};
