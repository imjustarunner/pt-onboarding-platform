import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, test: {
  environment: 'jsdom', restoreMocks: true, include: [
    'src/utils/__tests__/notificationActions.test.js',
    'src/components/tasks/__tests__/TasksNotesQueue.test.js',
    'src/components/tasks/__tests__/PaperPacketTaskAction.test.js',
    'src/views/__tests__/PublicIntakeGuardianResume.test.js',
    'src/views/__tests__/PublicIntakeFollowup.test.js',
    'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
    'src/components/public-intake/__tests__/PublicIntakeSchoolPaymentOptions.test.js',
    'src/components/clinical/__tests__/NoteAidGeneratedPlan.test.js',
    'src/components/school/__tests__/ReferralUpload.completion.test.js',
    'src/utils/__tests__/openEnrollmentReceipt.test.js',
    'src/components/admin/clientChart/__tests__/ClientOperationalDocumentOpen.test.js'
  ]
} });
