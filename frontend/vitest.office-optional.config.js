import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/components/digital-form/__tests__/IntakeQuestionOptional.test.js',
      'src/views/__tests__/PublicIntakeOptionalLabels.test.js',
      'src/views/__tests__/PublicIntakeReferralSource.test.js',
      'src/views/public/__tests__/JoinEnrollmentExperience.test.js',
      'src/utils/__tests__/officeQuestionnaireRecommend.test.js'
    ]
  }
});
