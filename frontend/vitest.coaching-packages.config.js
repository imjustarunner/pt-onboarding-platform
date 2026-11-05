import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/views/admin/__tests__/PackageCatalogAdminView.test.js',
    'src/composables/__tests__/ProviderBillingSettings.test.js',
    'src/components/admin/__tests__/ProviderBillingOwnerLinks.test.js'
  ] }
});
