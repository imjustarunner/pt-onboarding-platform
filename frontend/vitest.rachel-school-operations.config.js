import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue({template:{transformAssetUrls:false}})],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',restoreMocks:true,include:[
 'src/components/clientExchange/__tests__/ExchangeParameterSummary.test.js',
 'src/components/clientExchange/__tests__/ClientExchangeAuditPanel.test.js',
 'src/components/clientExchange/__tests__/ClientExchangePanel.test.js',
 'src/components/availability/__tests__/ProviderAvailabilityRow.test.js',
 'src/components/school/__tests__/SchoolStaffingWaitlists.test.js',
 'src/components/admin/__tests__/CredentialingTab.acceptance.test.js'
]}});
