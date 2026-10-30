import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/utils/__tests__/qaOct29.test.js',
 'src/utils/__tests__/loginRemember.test.js',
 'src/views/__tests__/LoginPortalIsolation.test.js',
 'src/views/__tests__/PublicIntakeProviderSelection.test.js',
 'src/views/__tests__/PublicIntakeGuardianResume.test.js',
 'src/components/admin/clientChart/__tests__/EnrollmentPreferencesSummary.test.js'
]}});
