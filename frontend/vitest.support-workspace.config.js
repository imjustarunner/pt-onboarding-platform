import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  publicDir: false,
  plugins: [vue({ template: { transformAssetUrls: false } })],
  test: { environment: 'jsdom', restoreMocks: true, include: [
    'src/components/tickets/__tests__/*.test.js',
    'src/components/conversa/__tests__/ConversaTeamCommunications.test.js',
    'src/components/communications/__tests__/CommunicationReviewQueue.test.js',
    'src/views/admin/__tests__/CommunicationsCenter.loading.test.js',
    'src/views/admin/__tests__/CommunicationsCenter.support.test.js'
  ] }
};
