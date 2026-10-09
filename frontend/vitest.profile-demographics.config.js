import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: { include: ['src/utils/__tests__/profileDemographics.test.js', 'src/components/admin/__tests__/ProviderDemographics.test.js'] }
});
