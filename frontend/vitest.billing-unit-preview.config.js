import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/billing/__tests__/BillingUnitPreview.test.js','src/views/admin/__tests__/BillingWorkspaceView.test.js']}});
