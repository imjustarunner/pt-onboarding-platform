import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:[
 'src/components/admin/clientChart/__tests__/*.test.js',
 'src/components/clientExchange/__tests__/ClientExchangePanel.test.js',
 'src/components/clientExchange/__tests__/InternalReferralModal.test.js',
 'src/components/__tests__/AccountSecurityNotice.holds.test.js',
 'src/composables/__tests__/useClientCreationDrafts.test.js',
 'src/utils/__tests__/queueAttention.test.js','src/utils/__tests__/clientInitials.test.js'
]}});
