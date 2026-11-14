import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],test:{environment:'jsdom',restoreMocks:true,include:[
'src/navigation/__tests__/paperInsuranceReview.test.js','src/components/billing/__tests__/ClientInsuranceEditor.test.js','src/components/billing/__tests__/InsurancePolicyFields.payers.test.js','src/components/clients/__tests__/SchoolPaperPacketWorkflow.test.js','src/components/clients/__tests__/PaperChecklistRoiReview.test.js','src/components/admin/clientChart/__tests__/ClientDocumentsGallery.test.js','src/components/admin/clientChart/__tests__/PaperEntryPoints.test.js'
]}});
