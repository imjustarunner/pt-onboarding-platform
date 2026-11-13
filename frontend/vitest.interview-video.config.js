import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'], include: [
    'src/components/video/__tests__/*.test.js',
    'src/components/hiring/__tests__/Interview*.test.js',
    'src/components/meetings/__tests__/MeetingRouteHost.test.js',
    'src/components/supervision/__tests__/SupervisionShareLink.test.js',
    'src/components/supervision/__tests__/SupervisionLeaveControls.test.js',
    'src/views/__tests__/hire.applicantInterview.test.js',
    'src/views/__tests__/InterviewStaffJoin.test.js',
    'src/views/__tests__/MeetingJoinEntry.test.js',
    'src/views/teamMeeting/__tests__/*.test.js',
    'src/composables/__tests__/useInterviewQuestion.test.js',
    'src/utils/__tests__/teamMeetingInvitationAccess.test.js'
  ] }
};
