import vue from '@vitejs/plugin-vue';
export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},plugins:[vue({template:{transformAssetUrls:{includeAbsolute:false}}})],test:{environment:'jsdom',include:[
 'src/views/admin/__tests__/PlotlineNamedCompany.test.js',
 'src/views/public/__tests__/PublicJobApplication.test.js',
 'src/views/public/__tests__/PublicCareersEmptyState.test.js',
 'src/components/plotline/__tests__/PlotlineAppSession.test.js',
 'src/components/plotline/__tests__/PlotlineReleaseStatus.test.js',
 'src/components/video/__tests__/videoConnectAttempt.test.js',
 'src/components/video/__tests__/VideoSessionRoom.test.js',
 'src/components/video/__tests__/VideoSessionRoom.microphone.test.js',
 'src/components/hiring/__tests__/CandidateInterviewDefaults.test.js',
 'src/utils/__tests__/appReleaseMonitor.test.js'
]}};
