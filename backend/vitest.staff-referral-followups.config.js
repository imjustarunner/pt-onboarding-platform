export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,execArgv:['--experimental-sqlite'],include:[
  'src/services/__tests__/schoolOnboarding.expiration.test.js','src/services/__tests__/schoolOnboardingReminders.test.js','src/**/__tests__/employeeAwards*.test.js',
  'src/services/__tests__/clientContactAffiliation.schema.test.js',
  'src/services/__tests__/clientExchange*.test.js','src/controllers/__tests__/clientExchange.test.js',
  'src/controllers/__tests__/staffDirectory.test.js','src/services/__tests__/announcementCelebrations.test.js',
  'src/services/__tests__/providerAcceptedInsurance*.test.js','src/controllers/__tests__/indirectTime*.test.js',
  'src/models/__tests__/payrollUserIndirect*.test.js','src/models/__tests__/personalTaskAssignments.test.js'
 ]}
};
