import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue({template:{transformAssetUrls:false}})],test:{environment:'jsdom',restoreMocks:true,include:[
 'src/utils/__tests__/chunkLoadRecovery.test.js',
 'src/utils/__tests__/startupSession.test.js',
 'src/__tests__/App.publicLogin.test.js',
 'src/services/__tests__/startupRequests.test.js',
 'src/store/__tests__/communicationsCounts.test.js',
 'src/composables/__tests__/useDashboardOverview.loading.test.js',
 'src/composables/__tests__/useDashboardOverview.events.test.js',
 'src/components/dashboard/__tests__/OverviewTodaySchedule.test.js'
]}});
