import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/provider/__tests__/ProviderUpdateQuickView.test.js','src/components/provider/__tests__/ProviderUpdateSecuritySetup.test.js','src/components/account/__tests__/QuickViewPrivacyPanel.test.js','src/components/dashboard/__tests__/MyAccountAccess.test.js']}});
