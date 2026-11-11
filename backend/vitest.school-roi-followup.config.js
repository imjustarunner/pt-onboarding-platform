export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',restoreMocks:true,include:[
'src/services/__tests__/schoolIntakeNotificationFeed.test.js','src/services/__tests__/guardianAccountStatus.test.js','src/services/__tests__/schoolRoiGuardianConsent.test.js','src/services/__tests__/schoolRoiGuardianRequests.test.js','src/controllers/__tests__/schoolPortalRoiBoundaries.test.js','src/services/__tests__/portalViewAs.test.js'
]}};
