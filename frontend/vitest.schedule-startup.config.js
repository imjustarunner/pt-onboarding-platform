import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}}, test:{environment:'jsdom', include:[
'src/components/schedule/__tests__/scheduleLoading.test.js',
'src/components/schedule/__tests__/scheduleSettingsPrivacy.test.js',
'src/components/schedule/__tests__/ScheduleCalendarMenu.test.js',
'src/components/schedule/__tests__/ScheduleAgencyLogo.test.js',
'src/utils/__tests__/scheduleLocationProjection.test.js',
'src/utils/__tests__/scheduleClientNames.test.js',
'src/utils/__tests__/scheduleSummaryRequests.test.js',
'src/utils/__tests__/scheduleSummaryPrefetch.test.js',
'src/views/__tests__/DashboardScheduleStartup.test.js',
'src/components/meetings/__tests__/MeetingTimeClaimsPanel.test.js'
]}});
