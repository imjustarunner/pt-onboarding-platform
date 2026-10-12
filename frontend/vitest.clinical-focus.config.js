import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:['src/components/provider/__tests__/ProviderClinicalFocusSettings.test.js','src/components/provider/__tests__/ProviderFocusEditor.test.js','src/components/itsco/__tests__/ItscoProviderDirectory.test.js','src/utils/__tests__/providerTimeSearch.test.js','src/navigation/__tests__/providerFocusWaiver.test.js','src/components/admin/__tests__/ProviderDemographics.test.js']}});
