import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, plugins: [vue()],
  test: { environment: 'jsdom', restoreMocks: true, include: [
    'src/components/school/__tests__/ReferralUpload.recovery.test.js',
    'src/components/school/__tests__/ReferralUpload.completion.test.js',
    'src/views/admin/__tests__/UnassignedDocumentsView.packets.test.js'
  ] }
});
