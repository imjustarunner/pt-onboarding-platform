import vue from '@vitejs/plugin-vue';
export default {
 root: new URL('.', import.meta.url).pathname,
 plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
 resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
 test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'], include: [
  'src/components/video/__tests__/*.test.js',
  'src/components/supervision/__tests__/SupervisionPersonalIdentity.test.js',
  'src/composables/__tests__/consentedAudioCapture.test.js',
  'src/utils/__tests__/supervisionConnectionDiagnostics.test.js'
 ] }
};
