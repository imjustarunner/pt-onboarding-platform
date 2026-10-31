import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/utils/__tests__/clientChartHubs.test.js',
    'src/components/admin/__tests__/ClientContactDocumentation.test.js',
    'src/composables/__tests__/useTicketingQueue.drafts.test.js',
    'src/components/school/__tests__/SchoolClientChatModal.test.js',
    'src/views/admin/__tests__/ProviderDirectoryAdministration.test.js'
  ] }
});
