import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
 root:new URL('.',import.meta.url).pathname,plugins:[vue()],
 resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},
 test:{environment:'jsdom',setupFiles:['./src/test/setup.js'],include:[
  'src/utils/__tests__/clientRosterContext.test.js',
  'src/utils/__tests__/bookingCatalogCache.test.js',
  'src/components/clients/__tests__/ClientPersonalPortalInvite.test.js',
  'src/components/clients/__tests__/ClientPortalInviteDialog.test.js',
  'src/components/dashboard/__tests__/ProviderClientsSchools.test.js',
  'src/components/dashboard/__tests__/ProviderClientsWaitlistScope.test.js',
  'src/utils/__tests__/clientProfileActions.test.js',
  'src/utils/__tests__/clientChartHubs.test.js',
  'src/components/clients/__tests__/ProviderSearchSelect.test.js',
  'src/components/clients/__tests__/ClientPortalOverview.test.js',
  'src/views/admin/__tests__/OfficeClientsAssignments.test.js',
  'src/views/admin/__tests__/ClientManagementView.setup.test.js',
  'src/components/admin/__tests__/ClientServiceAssignments.test.js',
  'src/components/admin/__tests__/ClientServiceEnrollments.providers.test.js',
  'src/components/admin/clientChart/__tests__/ClientOverviewHub.secureAction.test.js',
  'src/components/admin/__tests__/ClientAssignmentProfile.test.js',
  'src/components/admin/__tests__/ClientDemographicsSave.test.js',
  'src/components/admin/clientChart/__tests__/ClientSchoolChartSetup.test.js',
  'src/components/profile/__tests__/ProfileSectionNavigation.test.js',
  'src/components/admin/account/__tests__/ProfileQuickActions.test.js',
  'src/components/admin/account/__tests__/CompensationCategory.test.js'
 ]}
});
