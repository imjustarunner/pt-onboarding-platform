import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom', include: [
  'src/components/provider/__tests__/ProviderUpdateFallClients.test.js',
  'src/components/provider/__tests__/ProviderUpdateSaveLater.test.js',
  'src/components/provider/__tests__/ProviderUpdateContact.test.js'
] } });
