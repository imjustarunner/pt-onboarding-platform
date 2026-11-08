import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
 'src/utils/__tests__/apiBaseUrl.test.js','src/utils/__tests__/loginHandoff.test.js','src/utils/__tests__/completePasswordTokenLogin.portal.test.js','src/utils/__tests__/completeGoogleLogin.test.js',
 'src/views/__tests__/LoginPortalIsolation.test.js','src/__tests__/App.publicLogin.test.js','src/auricwell/__tests__/Compliance.test.js','src/views/admin/__tests__/NarrivaComplianceReports.test.js'
],maxWorkers:3}});
