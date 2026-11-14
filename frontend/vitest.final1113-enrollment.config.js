import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: {
  environment: 'jsdom', restoreMocks: true, include: [
    'src/components/public-intake/__tests__/InsuranceSubscriberResume.test.js',
    'src/components/public-intake/__tests__/InsurancePaymentEnrollment.test.js',
    'src/views/__tests__/PublicIntakeGuardianResume.test.js',
    'src/views/__tests__/PublicIntakeInsuranceContinue.test.js'
  ]
} });
