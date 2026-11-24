export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,env:{SKIP_DB_CONNECT:'1'},include:[
  'src/services/__tests__/clientReactivation.test.js',
  'src/services/__tests__/clientReactivationIntegrations.test.js',
  'src/models/__tests__/Client.reactivation.test.js',
  'src/models/__tests__/Appointment.reactivation.test.js',
  'src/services/__tests__/clientInactiveScheduling.test.js',
  'src/services/__tests__/clientLifecycleTaskSync.test.js',
  'src/services/__tests__/guardianCancellationReturnRequests.test.js',
  'src/controllers/__tests__/schoolProviderAssignment.test.js',
  'src/services/__tests__/scheduling.lifecycleRecurrence.test.js',
  'src/services/__tests__/clientExchangeClaims.test.js'
  ,'src/services/__tests__/scheduling.appointmentWriteGuard.test.js'
  ,'src/services/__tests__/paperPacketProcessing.test.js'
 ]}
};
