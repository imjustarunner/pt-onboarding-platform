import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
 'src/utils/__tests__/oddsAndEnds.test.js','src/utils/__tests__/companyEventStaffing.test.js','src/utils/__tests__/plannedOutTimezone.test.js','src/utils/__tests__/schoolCalendarRange.test.js',
 'src/composables/__tests__/useDashboardOverview.events.test.js','src/components/notifications/__tests__/AnnouncementToasts.test.js',
 'src/views/admin/__tests__/AnnouncementsHubToasts.test.js','src/views/admin/__tests__/PayrollPendingSubmissions.test.js'
]}});
