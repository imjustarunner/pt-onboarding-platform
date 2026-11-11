import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',restoreMocks:true,include:[
'src/utils/__tests__/guardianPortalStatus.test.js','src/utils/__tests__/schoolStaffRoiLabels.test.js','src/composables/__tests__/useAgencyMemberships.test.js','src/composables/__tests__/useLinkedGuardianContact.test.js','src/components/public/__tests__/SmartSchoolRoiFlow.test.js','src/components/clients/__tests__/ClientPortalOverview.test.js'
]}});
