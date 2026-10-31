import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},plugins:[vue()],test:{environment:'jsdom',include:[
 'src/components/clientExchange/__tests__/*.test.js',
 'src/views/admin/__tests__/EmployeeRelationsView.test.js',
 'src/views/__tests__/DashboardScheduleStartup.test.js',
 'src/components/schedule/__tests__/SupervisionAttendeeMandatoryPanel.test.js',
 'src/components/admin/__tests__/PrivilegedLoginBriefingWorkspace.test.js',
 'src/utils/__tests__/providerLoginBriefing.test.js','src/utils/__tests__/privilegedLoginBriefing.test.js'
]}});
