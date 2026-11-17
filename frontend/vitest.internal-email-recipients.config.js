import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, publicDir: false, plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/components/messages/__tests__/EmailRecipientCheck.test.js',
    'src/components/messages/__tests__/EmailRecipientField.test.js',
    'src/components/messages/__tests__/EmailComposer.test.js',
    'src/components/messages/__tests__/EmailComposerDock.integration.test.js'
  ] }
});
