import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: ['src/components/clinical/__tests__/UnlinkedNoteCleanupDialog.test.js', 'src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js'] }
});
