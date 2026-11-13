export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/careInvitation*.test.js','src/services/__tests__/scheduling.ownedOfficeSession.test.js','src/services/__tests__/claimMdIntakeEligibility.test.js','src/services/__tests__/enrollmentCompletion.confirmation.test.js','src/services/__tests__/enrollmentCompletion.portalBranding.test.js','src/services/__tests__/enrollmentCompletion.guardianInvites.test.js'],restoreMocks:true,unstubEnvs:true}
};
