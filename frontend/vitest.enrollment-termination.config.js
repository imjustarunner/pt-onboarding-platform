import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [vue({ template: { transformAssetUrls: false } })],
  test: {
    environment: 'jsdom',
    include: [
      'src/components/admin/__tests__/OfficeIntakeQueuePanel.termination.test.js',
      'src/components/admin/__tests__/ClientTerminationSummary.test.js',
      'src/components/admin/clientChart/__tests__/ClientStatusEditor.test.js',
      'src/components/admin/__tests__/EnrollmentFollowupComposer.test.js',
      'src/components/admin/__tests__/InactiveClientsPanel.test.js',
      'src/components/admin/__tests__/OfficeIntakeQueuePanel.retest.test.js'
    ]
  }
});
