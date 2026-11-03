export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/oddsAndEnds.test.js','src/controllers/__tests__/oddsAndEnds.staffing.test.js','src/controllers/__tests__/agencyAnnouncementToasts.test.js','src/services/__tests__/guardianPortalExpansion.test.js','src/**/__tests__/events.*.test.js','src/services/__tests__/faxExtraction.test.js'],restoreMocks:true}
};
