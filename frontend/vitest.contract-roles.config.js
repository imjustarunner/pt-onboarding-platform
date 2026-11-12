import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/hiring/__tests__/ContractServiceRolesEditor.test.js','src/components/hiring/__tests__/ContractServiceFocusSelect.test.js']}});
