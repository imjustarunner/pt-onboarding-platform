import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, plugins:[vue()],
  test: { environment:'jsdom', include:[
    'src/components/clients/__tests__/ClientTransitionInvitation.test.js',
    'src/components/admin/__tests__/ClientServiceEnrollments.providers.test.js',
    'src/components/admin/__tests__/ClientServiceAssignments.test.js',
    'src/views/admin/__tests__/ClientManagementView.setup.test.js',
    'src/components/admin/clientChart/__tests__/ClientImportGuardianAccounts.test.js',
    'src/components/admin/clientChart/__tests__/ClientStatusEditor.test.js','src/components/admin/clientChart/__tests__/ClientRecordsUpdateLauncher.test.js',
    'src/utils/__tests__/officeBillingDefaults.test.js',
    'src/utils/__tests__/clientCreationOutcome.test.js',
    'src/components/billing/__tests__/AssignmentCoverageReview.test.js','src/components/billing/__tests__/InsuranceVerificationGate.test.js',
    'src/components/admin/clientChart/__tests__/ClientSchedulePanel.test.js',
    'src/components/admin/clientChart/__tests__/ClientUpdateAssignments.test.js',
    'src/components/admin/clientChart/__tests__/ClientImportCompletion.realAssignments.test.js',
    'src/components/admin/clientChart/__tests__/ClientMedicalHistory.test.js',
    'src/utils/__tests__/auricwellMedicalArchive.test.js',
    'src/utils/__tests__/medicalArchivePageCopy.test.js',
    'src/components/school/__tests__/LifecycleActionModal.test.js','src/utils/__tests__/clientChartHubs.test.js','src/composables/__tests__/useClientEncounters.clarity.test.js',
    'src/components/admin/clientChart/__tests__/ClientEhrBringUpToDatePanel.test.js',
    'src/components/admin/clientChart/__tests__/ClientChartUpdateModal.test.js',
    'src/components/admin/clientChart/__tests__/ClientRecordsCreateModal.test.js',
    'src/components/admin/clientChart/__tests__/ClientSupplementaryRecords.test.js',
    'src/components/admin/clientChart/__tests__/ClientPayerLinkage.test.js',
    'src/components/admin/clientChart/__tests__/ClientSchoolChartSetup.test.js',
    'src/components/clinical/__tests__/NoteAidGeneratedPlan.test.js',
    'src/components/admin/clientChart/__tests__/ClientIntakeNotePanel.review.test.js',
    'src/components/clients/__tests__/ClientAgencyLogo.test.js', 'src/composables/__tests__/useChartImportDrafts.test.js',
    'src/services/__tests__/api.chartAgencyContext.test.js'
  ] }
});
