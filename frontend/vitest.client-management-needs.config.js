import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/utils/__tests__/clientManagementWorkspace.test.js','src/components/admin/__tests__/RenewalFlagsChips.needs.test.js','src/components/admin/clientChart/__tests__/ClientChartUpdateModal.test.js']}});
