export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/intakeDraftReview.test.js','src/services/__tests__/intakeRegenerationSource.test.js','src/controllers/__tests__/adultClinicalRetest.test.js','src/controllers/__tests__/intakeFinalizationConcurrency.test.js','src/services/__tests__/activityProtection.views.test.js'],restoreMocks:true}
};
