export default {
 root:new URL('.',import.meta.url).pathname,
 test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
  'src/services/__tests__/scheduling.scheduleNoticeBuffer.test.js',
  'src/services/__tests__/scheduling.ownedOfficeSession.test.js',
  'src/services/__tests__/scheduling.ownedOfficeSessionJobs.test.js',
  'src/services/__tests__/careInvitationWorker.test.js',
  'src/services/__tests__/careInvitationBooking.notices.test.js',
  'src/controllers/__tests__/scheduling.recurringBookingNotices.test.js',
  'src/controllers/__tests__/guardianAccess.notificationHistory.test.js',
  'src/utils/__tests__/scheduling.recurringBookingNotice.test.js'
 ]}
};
