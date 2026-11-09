import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  publicDir: false,
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/components/dashboard/__tests__/StaffPollsPanel.test.js',
    'src/components/conversa/__tests__/ConversaTeamCommunications.test.js',
    'src/components/admin/__tests__/StaffPollResultsReview.test.js',
    'src/views/__tests__/StaffEventView.test.js'
  ] }
});
