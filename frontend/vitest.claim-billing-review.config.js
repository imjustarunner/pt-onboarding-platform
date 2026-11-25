import {defineConfig} from 'vitest/config';import vue from '@vitejs/plugin-vue';
export default defineConfig({root:new URL('.',import.meta.url).pathname,plugins:[vue()],resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{environment:'jsdom',include:[
 'src/components/billing/__tests__/ClaimFinancialReview.test.js','src/components/billing/__tests__/ClaimRateDefaults.test.js','src/components/clinical/__tests__/NoteBillingDisposition.test.js',
 'src/components/admin/__tests__/ClaimMdWorkspace.test.js','src/components/billing/__tests__/ClaimWorkTable.test.js','src/components/clinical/__tests__/ClinicalNoteDetailFetcher.test.js','src/views/admin/__tests__/BillingWorkspaceView.test.js','src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js'
]}});
