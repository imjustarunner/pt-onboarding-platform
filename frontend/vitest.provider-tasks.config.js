import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  test: { environment: 'jsdom', include: [
    'src/components/provider/__tests__/ProviderUpdateReminderSplash.test.js',
    'src/components/provider/__tests__/ProviderUpdateAssignedBanner.test.js',
    'src/components/tasks/__tests__/ExchangeSetupTask.test.js'
  ] }
});
