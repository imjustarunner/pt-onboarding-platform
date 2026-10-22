import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  test: { environment:'jsdom', include:['src/components/billing/__tests__/ClientAccountSupport.test.js','src/components/billing/__tests__/ClientInsuranceEditor.test.js','src/utils/__tests__/clientAccountSupportAccess.test.js','src/components/clients/__tests__/ClientPortalInviteDialog.test.js'] }
});
