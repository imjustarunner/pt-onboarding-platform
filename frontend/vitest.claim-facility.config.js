import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/components/billing/__tests__/BillingPracticeSettings.test.js',
    'src/components/billing/__tests__/ClaimResubmissionPanel.test.js',
    'src/components/admin/__tests__/ClaimMdWorkspace.test.js'
  ] }
});
