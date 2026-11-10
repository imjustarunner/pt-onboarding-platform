import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/views/admin/__tests__/CredentialingWorkspaceView.test.js',
    'src/components/admin/__tests__/CredentialingOperationsPanel.test.js',
    'src/components/admin/__tests__/ProviderPayerCredentialsPanel.test.js',
    'src/components/admin/__tests__/CredentialingTab.acceptance.test.js',
    'src/components/meetings/__tests__/PlanComparisonTable.test.js',
    'src/components/billing/__tests__/BillingFeeSchedule.test.js',
    'src/utils/__tests__/notificationActions.test.js'
  ] }
});
