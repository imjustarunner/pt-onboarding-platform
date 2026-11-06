export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/utils/__tests__/agencyAccessPolicy.test.js',
  'src/utils/__tests__/agencyAccessContext.test.js',
  'src/utils/__tests__/agencyAccessMemberships.test.js',
  'src/middleware/__tests__/agencyAccessProfiles.test.js',
  'src/services/__tests__/agencyAccessProfiles.test.js',
  'src/services/__tests__/hire.interviewAccess.test.js',
  'src/middleware/__tests__/supportContentAccess.test.js',
  'src/services/__tests__/managedBillingScope.test.js'
  ,'src/services/__tests__/scheduling.billingAccess.test.js'
  ,'src/services/__tests__/messaging.departmentalGroups.test.js'
 ],restoreMocks:true}
};
