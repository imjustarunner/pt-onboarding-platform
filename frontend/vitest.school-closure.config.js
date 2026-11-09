import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/notifications/__tests__/SchoolClosureDeliverySelect.test.js','src/components/notifications/__tests__/SchoolClosureDashboardNotice.test.js']}});
