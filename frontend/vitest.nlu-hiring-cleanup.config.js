import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',maxWorkers:4,include:['src/services/__tests__/api.nluPrehireLoading.test.js','src/services/__tests__/api.agencyContext.test.js','src/views/admin/__tests__/StartPreHire.nlu.test.js','src/components/hiring/__tests__/ContractServiceRolesEditor.test.js','src/components/hiring/__tests__/ChildcareRateScheduleEditor.test.js']}});
