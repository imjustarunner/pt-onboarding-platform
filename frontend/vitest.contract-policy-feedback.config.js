import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',include:['src/components/hiring/__tests__/ContractProbationChoice.test.js','src/components/admin/__tests__/CompensationDraftsPanel.nlu.test.js']}});
