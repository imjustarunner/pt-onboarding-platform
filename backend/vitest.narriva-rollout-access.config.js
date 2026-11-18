export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/scheduling.clientSessionBookingRollout.test.js','src/controllers/__tests__/scheduling.clientSessionRolloutAccess.test.js','src/controllers/__tests__/scheduling.sharedOfficeBooking.test.js','src/services/__tests__/scheduling.careEligibility.test.js','src/services/__tests__/scheduling.selfPayBooking.test.js','src/services/__tests__/scheduling.clinicalEdit.test.js','src/utils/__tests__/noteWriterContextPolicy.test.js'],restoreMocks:true}
};
