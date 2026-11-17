import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname, plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { environment: 'jsdom', include: ['src/components/admin/__tests__/ClientWorkspaceControls.test.js', 'src/components/admin/clientChart/__tests__/ClientChartShell.collapse.test.js', 'src/components/admin/clientChart/__tests__/ClientDisclosurePanel.portal.test.js'] }
});
