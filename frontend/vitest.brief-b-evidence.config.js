import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: [
  "src/views/__tests__/PublicIntakeFollowup.test.js",
  "src/views/__tests__/PublicIntakeInsuranceContinue.test.js",
  "src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js",
  "src/components/public/__tests__/SmartSchoolRoiFlow.test.js",
  "src/components/guardian/__tests__/GuardianSchoolReleaseForm.test.js",
  "src/utils/__tests__/schoolClientStatusDisplay.test.js",
  "src/utils/__tests__/schoolServiceStatusParity.test.js",
  "src/components/school/__tests__/SchoolContactPlanSplash.test.js",
  "src/components/clinical/__tests__/ClinicalNoteSupervisorReview.test.js",
  "src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js",
  "src/components/clients/__tests__/ClientPortalOverview.test.js",
  "src/components/__tests__/AccountSecurityNotice.holds.test.js"
] } });
