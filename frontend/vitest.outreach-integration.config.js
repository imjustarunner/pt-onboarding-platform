import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',globals:true,include:[
 'src/components/admin/__tests__/OutreachTripHistory.test.js',
 'src/components/events/__tests__/EventTravelReportModal.test.js',
 'src/views/public/__tests__/CompanyEventStaffView.test.js',
 'src/utils/__tests__/eventTravel.test.js',
 'src/utils/__tests__/eventTravelLink.test.js',
 'src/components/dashboard/__tests__/JacquelyneTime.test.js'
]}});
