import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{include:['src/components/admin/__tests__/ProviderUpdateReviewSend.test.js','src/components/provider/__tests__/ProviderUpdateTrainingGuides.test.js','src/components/admin/__tests__/ProviderUpdateTrainingEditor.test.js']}});
