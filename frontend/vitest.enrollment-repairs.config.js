import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',setupFiles:['./src/test/setup.js'],include:["src/components/schedule/__tests__/OfficeEventSessionNotePanel.test.js",
  "src/navigation/intake/__tests__/respondentAndSchoolReview.test.js",
  "src/components/public/__tests__/SmartSchoolRoiFlow.test.js",
  "src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js",
  "src/components/public-intake/__tests__/PublicIntakeSchoolPaymentOptions.test.js",
  "src/components/school/__tests__/ReferralUpload.completion.test.js",
  "src/components/clients/__tests__/SchoolPaperPacketWorkflow.test.js",
  "src/components/guardian/__tests__/GuardianInvitations.test.js",
  "src/components/guardian/__tests__/GuardianSchoolReleaseForm.test.js",
  "src/views/__tests__/PublicIntakeGuardianResume.test.js",
  "src/components/school/__tests__/SchoolNotificationsPanel.test.js",
  "src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js",
  "src/views/admin/__tests__/TenantAdminDashboard.loading.test.js",
  "src/utils/__tests__/notificationActions.test.js",
  "src/composables/__tests__/useClientEncounters.test.js",
  "src/utils/__tests__/calendarDate.test.js"
]}});
