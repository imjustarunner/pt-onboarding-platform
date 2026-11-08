import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/views/__tests__/PublicIntakeFollowup.test.js',
  'src/views/__tests__/PublicIntakeInsuranceContinue.test.js',
  'src/views/__tests__/PublicIntakeFinalizePending.test.js',
  'src/views/__tests__/NotesWorkspaceQueueLaunch.test.js',
  'src/components/public-intake/__tests__/PublicIntakeSchoolPaymentOptions.test.js',
  'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
  'src/components/public/__tests__/SmartSchoolRoiFlow.test.js',
  'src/config/__tests__/noteAidWorkspace.test.js',
  'src/components/clinical/__tests__/NoteAidTreatmentPlanStandaloneModal.test.js',
  'src/__tests__/App.publicLogin.test.js',
  'src/components/admin/__tests__/ClientUpdateModal.test.js'
] } });
