export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/**/__tests__/scheduledTraining*.test.js','src/**/__tests__/meetingTeamPersonalAccess.test.js','src/**/__tests__/meetingCompensationPolicy.test.js','src/**/__tests__/meetingActivityHistory.test.js','src/**/__tests__/meetingInvitations.test.js','src/**/__tests__/meetingConfiguredReminders.test.js','src/**/__tests__/meetingSettingsPolicy.test.js','src/**/__tests__/meetingReminders.test.js','src/**/__tests__/meetingClaimRate.test.js','src/**/__tests__/myMeetings.test.js','src/**/__tests__/supervisionAttendancePolicy.test.js','src/**/__tests__/supervisionEmail.test.js','src/**/__tests__/supervisionEmailDelivery.test.js','src/**/__tests__/meetingSupervisionReminders.test.js','src/**/__tests__/meetingInvitationResponse.test.js'],restoreMocks:true}
};
