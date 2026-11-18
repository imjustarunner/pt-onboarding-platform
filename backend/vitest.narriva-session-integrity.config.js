export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/bookedSessionWork.test.js','src/services/__tests__/clinicalDraftSessionContext.test.js','src/services/__tests__/clinicalDraftAppointmentRepair.test.js','src/controllers/__tests__/clientServiceCodeEligibility.test.js','src/models/__tests__/ClinicalNoteDraft.queueRecovery.test.js','src/utils/__tests__/noteAidAutomaticAfterHours.test.js'],restoreMocks:true}
};
