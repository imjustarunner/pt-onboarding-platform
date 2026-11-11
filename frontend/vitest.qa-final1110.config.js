import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: {
  environment: 'jsdom', restoreMocks: true, include: [
    'src/utils/__tests__/activityTracker.test.js',
    'src/utils/__tests__/sessionDeadline.test.js',
    'src/components/__tests__/StatusPromptModal.test.js',
    'src/components/__tests__/AccountSecurityNotice.holds.test.js',
    'src/components/clients/__tests__/ClientOperationalStatus.test.js',
    'src/components/admin/clientChart/__tests__/ClientRecordsOverview.receipts.test.js',
    'src/views/__tests__/PublicIntake1110Recovery.test.js',
    'src/views/__tests__/PublicIntakeInsuranceContinue.test.js',
    'src/views/__tests__/PublicIntakeFinalizePending.test.js',
    'src/views/__tests__/PublicIntakeLegalLocale.test.js',
    'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
    'src/components/public/__tests__/PacketSectionConsentFlow.test.js',
    'src/components/public/__tests__/SmartDisclosureFlow.test.js',
    'src/utils/__tests__/enrollmentCoverage.test.js',
    'src/constants/__tests__/officeIntakeSpanish.test.js',
    'src/constants/__tests__/structuredIntakeStepSpanish.test.js'
  ]
} });
