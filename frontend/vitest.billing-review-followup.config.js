import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: [
    'src/components/admin/__tests__/ClaimMdWorkspace.test.js',
    'src/components/admin/__tests__/SupervisedPayerPolicies.test.js',
    'src/components/billing/__tests__/ClientInsuranceEditor.test.js',
    'src/components/billing/__tests__/CoverageVerification.test.js',
    'src/components/billing/__tests__/ClientDocumentationReadiness.test.js',
    'src/utils/__tests__/billingReviewDisplay.test.js'
  ] }
});
