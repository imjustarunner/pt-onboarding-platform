import vue from '@vitejs/plugin-vue';
export default {
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue({ template: { transformAssetUrls: false } })],
  test: { environment: 'jsdom', restoreMocks: true, include: [
    'src/views/admin/__tests__/CommunicationsCenter.loading.test.js',
    'src/utils/__tests__/startupBranding.test.js',
    'src/components/unifiedInbox/__tests__/UnifiedInboxShell.test.js',
    'src/services/__tests__/publicAvailabilityRead.test.js'
  ] }
};
