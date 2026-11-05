import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: [
      'src/components/unifiedInbox/__tests__/*.test.js',
      'src/components/messages/__tests__/MessagesHubShell.threading.test.js',
      'src/components/messages/__tests__/EmailThreadReader.test.js',
      'src/components/tickets/__tests__/TicketDetailModal.test.js',
      'src/components/tickets/__tests__/TicketDeskView.test.js',
      'src/utils/__tests__/ticketAccess.test.js'
    ]
  }
});
