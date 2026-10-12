import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/__tests__/CredentialPicker.test.js','src/components/__tests__/HirePortalNavigation.test.js','src/components/provider/__tests__/ProviderUpdateCommunicationPage.test.js']}});
