import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: {
  environment: 'jsdom', restoreMocks: true, include: [
    'src/views/__tests__/PublicIntake1110Recovery.test.js',
    'src/views/__tests__/PublicIntakeInsuranceContinue.test.js',
    'src/views/__tests__/PublicIntakeFinalizePending.test.js',
    'src/views/__tests__/PublicIntakeLegalLocale.test.js',
    'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
    'src/utils/__tests__/enrollmentCoverage.test.js',
    'src/constants/__tests__/officeIntakeSpanish.test.js',
    'src/constants/__tests__/structuredIntakeStepSpanish.test.js'
  ]
} });
