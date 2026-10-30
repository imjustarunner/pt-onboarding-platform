import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/components/tasks/__tests__/DocumentCountersignatures.test.js',
 'src/components/tasks/__tests__/TasksNotesQueue.test.js',
 'src/components/documents/__tests__/DocumentSigningWorkflow.test.js',
 'src/components/provider/__tests__/ProviderUpdateAmendment.test.js'
]}});
