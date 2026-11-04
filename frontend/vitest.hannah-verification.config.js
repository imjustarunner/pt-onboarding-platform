import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/components/billing/__tests__/AssignmentCoverageReview.test.js',
      'src/components/billing/__tests__/InsuranceVerificationGate.test.js',
      'src/components/billing/__tests__/ClientInsuranceEditor.test.js',
      'src/components/billing/__tests__/CoverageVerification.test.js',
      'src/components/billing/__tests__/ClientDocumentationReadiness.test.js'
    ]
  }
});
