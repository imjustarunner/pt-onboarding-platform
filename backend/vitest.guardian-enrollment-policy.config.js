export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/**/__tests__/schoolGuardianPolicy*.test.js',
  'src/services/__tests__/enrollmentCompletion.access.test.js',
  'src/services/__tests__/clientPortalInvites.test.js',
  'src/services/__tests__/schoolIntakeCommunications.test.js',
  'src/services/__tests__/guardianReminderPreferences.test.js',
  'src/services/__tests__/guardianNotificationSetup.test.js'
 ],restoreMocks:true}
};
