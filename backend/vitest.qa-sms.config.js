export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/services/__tests__/qaSessionNotificationWorker.test.js',
  'src/services/__tests__/qaNotificationQueueScope.test.js',
  'src/services/__tests__/appointmentReplyFeeAcknowledgement.test.js',
  'src/services/__tests__/schoolAppointmentNotifications.test.js',
  'src/services/__tests__/messaging.communicationReception.test.js',
  'src/services/__tests__/scheduling.*.test.js'
 ],restoreMocks:true}
};
