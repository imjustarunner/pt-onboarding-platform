import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',restoreMocks:true,include:[
 'src/utils/__tests__/loginHandoff.test.js','src/utils/__tests__/loginAutomation.test.js','src/views/__tests__/LoginPortalIsolation.test.js','src/composables/__tests__/useDashboardNavigation.test.js','src/utils/__tests__/familyPortalContext.test.js',
 'src/components/tasks/__tests__/TasksHub.completedLookup.test.js',
 'src/components/messages/__tests__/MessagesHubShell.secureClientLink.test.js',
 'src/components/messages/__tests__/MessagesHubShell.threading.test.js',
 'src/components/guardian/__tests__/GuardianSecureConversations.test.js',
 'src/services/__tests__/schoolAgencyWorkspace.test.js',
 'src/components/schedule/__tests__/SupervisionRecordPanel.test.js',
 'src/components/schedule/__tests__/AppointmentRemindersPanel.policy.test.js',
 'src/components/admin/clientChart/__tests__/ClientTreatmentPlansPanel.progress.test.js',
 'src/components/guardian/__tests__/GuardianIntakeDocuments.test.js',
 'src/components/billing/__tests__/CoverageVerification.test.js',
 'src/components/clients/__tests__/SchoolPaperPacketWorkflow.test.js',
 'src/components/clinical/__tests__/NoteAidGeneratedPlan.test.js'
]}});
