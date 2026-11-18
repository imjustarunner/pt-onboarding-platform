import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
 'src/components/plotline/__tests__/PlotlineSessionBoundary.test.js',
 'src/components/plotline/__tests__/PlotlineAppSession.test.js',
 'src/views/admin/__tests__/CareersJobRecovery.test.js',
 'src/components/__tests__/SessionLockScreen.test.js',
 'src/utils/__tests__/activityTracker.test.js',
 'src/store/__tests__/sessionLock.test.js',
 'src/components/hiring/__tests__/CandidateInterviewDefaults.test.js',
 'src/components/hiring/__tests__/InterviewInviteReadiness.test.js',
 'src/views/admin/__tests__/InterviewHubView.test.js',
 'src/views/__tests__/PlotlineSelfService.test.js'
]}};
