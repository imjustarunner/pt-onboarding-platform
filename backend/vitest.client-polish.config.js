import {defineConfig} from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',include:[
 'src/models/__tests__/ClientPhiDocument.privateHistory.test.js','src/controllers/__tests__/clientCreationDraft.test.js','src/services/__tests__/clientChartHistory.test.js','src/services/__tests__/clientCreationDraftReadiness.test.js','src/services/__tests__/privatePacketScanJob.test.js','src/services/__tests__/privateClinicalMaterialScan.test.js',
 'src/utils/__tests__/activityProtection.test.js','src/middleware/__tests__/accountSecurity.test.js'
]}});
