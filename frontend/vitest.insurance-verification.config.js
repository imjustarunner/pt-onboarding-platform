import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',restoreMocks:true,include:['src/components/billing/__tests__/CoverageVerification.test.js','src/components/billing/__tests__/InsuranceVerificationQueue.test.js','src/components/billing/__tests__/EligibilityAutomationPanel.test.js','src/components/billing/__tests__/ClientInsuranceEditor.test.js']}});
