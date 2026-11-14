import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/components/admin/clientChart/__tests__/ClientOverviewHub.familyWelcome.test.js','src/components/admin/clientChart/__tests__/ClientOverviewHub.secureAction.test.js',
 'src/components/school/__tests__/SchoolContactWorkflowCard.test.js','src/components/school/__tests__/SchoolClientOverviewPanel.test.js','src/components/school/__tests__/SchoolClientChatModal.test.js',
 'src/components/__tests__/CommandPalette.sessionRecovery.test.js','src/components/__tests__/WorkspacePolling.sessionRecovery.test.js',
 'src/components/__tests__/AccountSecurityNotice.holds.test.js','src/components/dashboard/__tests__/StaffPollsPanel.test.js','src/components/dashboard/__tests__/StaffPollsPanel.loading.test.js',
 'src/components/availability/__tests__/ProviderAvailabilityNotice.test.js','src/components/meetings/__tests__/ActiveMeetingToasts.test.js',
 'src/components/schedule/__tests__/scheduleLoading.test.js','src/components/school/__tests__/SchoolContactPlanSplash.test.js',
 'src/components/provider/__tests__/ProviderUpdateAssignedBanner.test.js','src/components/availability/__tests__/ContractSchedulingNotice.test.js','src/store/__tests__/communicationsCounts.test.js'
]}});
