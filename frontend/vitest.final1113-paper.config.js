import {defineConfig} from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',restoreMocks:true,include:[
 'src/navigation/__tests__/paperInsuranceCompletion.test.js',
 'src/components/clients/__tests__/SchoolPaperPacketWorkflow.test.js',
 'src/components/billing/__tests__/ClientInsuranceEditor.test.js',
 'src/components/admin/__tests__/PhiDocumentsPanel.upload.test.js'
]}});
