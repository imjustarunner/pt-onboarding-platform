import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue({template:{transformAssetUrls:{includeAbsolute:false}}})],test:{environment:'jsdom',include:[
 'src/components/admin/opsDashboard/__tests__/PeopleOpsCompanyScope.test.js',
 'src/components/hiring/__tests__/CandidateInterviewDefaults.test.js',
 'src/components/hiring/__tests__/InterviewInviteReadiness.test.js',
 'src/views/admin/__tests__/CareersJobRecovery.test.js',
 'src/views/admin/__tests__/HiringDashboardCompanyScope.test.js',
 'src/views/admin/__tests__/CareersInterviewSave.test.js',
 'src/views/admin/__tests__/InterviewHubView.test.js',
 'src/views/__tests__/MeetingJoinEntry.test.js',
 'src/views/__tests__/InterviewStaffJoin.test.js'
]}};
