import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],test:{environment:'jsdom',include:['src/components/admin/__tests__/ProviderUpdateReminders.test.js','src/components/admin/__tests__/ProviderUpdateReviewSend.test.js']}});
