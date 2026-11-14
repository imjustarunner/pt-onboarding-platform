import base from './vitest.nlu-ui-refresh.config.js';
export default {...base,test:{...base.test,include:[...new Set([...base.test.include,
'src/components/schedule/__tests__/ServiceOpenings.test.js','src/components/guardian/__tests__/GuardianBookingPackage.test.js','src/views/public/__tests__/PublicAgencyEnrollment.test.js','src/router/__tests__/guardianReceiptAccess.test.js','src/views/__tests__/DashboardScheduleStartup.test.js','src/utils/__tests__/nluWorkspace.test.js','src/components/guardian/__tests__/GuardianEnrollmentStart.test.js','src/components/learning/__tests__/LearningEnrollment.test.js'
])]}};
