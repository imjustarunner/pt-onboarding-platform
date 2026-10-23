import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:['src/components/availability/__tests__/ProviderAvailabilitySettings.test.js','src/views/__tests__/DashboardAccountNavigation.test.js']}});
