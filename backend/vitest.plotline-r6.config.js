export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',include:[
 'src/utils/__tests__/uploads.publicAssets.test.js',
 'src/utils/__tests__/hire.referenceQuestionnaire.test.js',
 'src/services/__tests__/hire.referenceWorkspace.test.js',
 'src/services/__tests__/hire.referenceReminder.test.js',
 'src/services/__tests__/hire.referenceIdentity.test.js',
 'src/services/__tests__/hire.referenceReceipt.test.js',
 'src/services/__tests__/hire.referenceCompletionEmail.test.js',
 'src/services/__tests__/hire.referenceBranding.test.js',
 'src/services/mobile/__tests__/notificationHiringAccess.test.js',
 'src/services/__tests__/hire.referenceRelease.test.js',
 'src/services/__tests__/teamMeetingRoomCapabilities.test.js',
 'src/services/__tests__/meetingCalendarGuest.test.js',
 'src/services/__tests__/meetingDialInPolicy.test.js',
 'src/services/__tests__/meetingDialInAccess.test.js',
 'src/services/__tests__/meetingDialInDisabled.test.js',
 'src/services/__tests__/meetingDialInVideoIsolation.test.js'
]}};
