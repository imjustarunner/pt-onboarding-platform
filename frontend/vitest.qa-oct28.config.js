import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
'src/views/__tests__/LoginPortalIsolation.test.js',
'src/utils/__tests__/portalDates.test.js',
'src/components/guardian/__tests__/GuardianInvitations.test.js',
'src/components/school/redesign/__tests__/SchoolStaffPanel.phone.test.js',
'src/components/school/redesign/__tests__/SchoolStaffPanel.recovery.test.js',
'src/views/__tests__/PublicIntakeProviderSelection.test.js',
'src/views/__tests__/PublicIntakeGuardianResume.test.js',
'src/utils/__tests__/loginRemember.test.js',
'src/components/admin/__tests__/ClientDemographicsSave.test.js'
]}});
