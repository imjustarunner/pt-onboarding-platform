import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [vue()], test: { environment: 'jsdom', include: ['src/components/client/__tests__/ClientAffiliatedContactsPanel.test.js'], restoreMocks: true } });
