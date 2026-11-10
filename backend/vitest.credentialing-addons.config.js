import credentialing from './vitest.credentialing.config.js';
export default { ...credentialing, test: { ...credentialing.test, include: [
  ...credentialing.test.include,
  'src/services/__tests__/meetingProductPlanPolicy.test.js',
  'src/services/__tests__/auricwellPricing.test.js',
  'src/services/__tests__/feeSchedule.test.js',
  'src/controllers/__tests__/supervisionBooking.test.js',
  'src/controllers/__tests__/meetingSupervisionLaunch.test.js',
  'src/services/__tests__/supervisionRecurrenceEdit.test.js',
  'src/services/__tests__/meetingSupervisionPersonalAccess.test.js'
] } };
