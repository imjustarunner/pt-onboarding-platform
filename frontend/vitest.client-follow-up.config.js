import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/clientFollowUpSetup.js'],
    include: [
      'src/components/clients/__tests__/ClientFollowUpTask.test.js',
      'src/components/admin/__tests__/ClientFollowUpEntryPoints.test.js',
      'src/components/admin/__tests__/ClientAssignmentProfile.test.js',
      'src/components/tasks/__tests__/ClientFollowUpTaskLink.test.js',
      'src/components/tasks/__tests__/ExchangeSetupTask.test.js',
      'src/components/tasks/__tests__/BillingAutomationTask.test.js',
      'src/views/admin/__tests__/OfficeClientsAssignments.test.js',
      'src/utils/__tests__/clientFollowUpTask.test.js',
      'src/utils/__tests__/clientProfileActions.test.js'
    ]
  }
});
