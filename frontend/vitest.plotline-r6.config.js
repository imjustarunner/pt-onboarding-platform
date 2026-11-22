import base from './vitest.plotline-r5.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,
 'src/utils/__tests__/uploadsUrl.publicAssets.test.js',
 'src/components/supervision/__tests__/SupervisionVideoLobbyPanel.test.js',
 'src/components/meetings/__tests__/MeetingDialInPanel.test.js',
 'src/views/teamMeeting/__tests__/TeamMeetingLayoutGuests.test.js',
 'src/views/teamMeeting/__tests__/TeamMeetingLeave.test.js',
 'src/views/__tests__/InterviewStaffJoin.test.js',
 'src/components/hiring/__tests__/ReferenceWorkspace.test.js',
 'src/views/__tests__/HiringReferenceForm.test.js'
]}};
