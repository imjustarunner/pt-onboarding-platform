import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/views/__tests__/PublicIntake{SpanishFallback,CaptchaLifecycle,LegalLocale,Followup,OptionalLabels,ProviderSelection,GuardianResume,SchoolChildren,ReferralSource}.test.js',
      'src/views/public/__tests__/{JoinEnrollmentExperience,ProviderEnrollmentEntry}.test.js',
      'src/constants/__tests__/{officeIntakeSpanish,structuredIntakeStepSpanish}.test.js',
      'src/utils/__tests__/{officeAdultConsent,officeIntakeNavigation,officeQuestionnaireRecommend}.test.js',
      'src/components/public-intake/__tests__/OfficeSpanishDisplay.test.js',
      'src/components/public/__tests__/{PacketSectionConsentFlow,SmartDisclosureFlow}.test.js',
      'src/components/digital-form/__tests__/IntakeQuestionOptional.test.js'
    ]
  }
});
