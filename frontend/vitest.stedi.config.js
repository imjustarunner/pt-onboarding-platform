import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/billing/__tests__/CoordinationOfBenefitsPanel.test.js','src/components/billing/__tests__/InsuranceDiscoveryPanel.test.js','src/components/billing/__tests__/ClientInsuranceEditor.test.js']}});
