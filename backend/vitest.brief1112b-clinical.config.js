export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',restoreMocks:true,include:[
 'src/services/__tests__/meetingEndPermission.test.js','src/services/__tests__/meetingEndPermission.mysql.test.js',
 'src/services/__tests__/sessionMaterialScan.test.js','src/services/__tests__/sessionSupportingMaterials.test.js',
 'src/services/__tests__/privatePacketScanJob.test.js','src/services/__tests__/privateClinicalMaterialScan.test.js','src/services/__tests__/privateClinicalMaterialScan.mysql.test.js',
 'src/services/__tests__/narrivaAssessmentEvidence.test.js','src/services/__tests__/medicalServiceCatalogRead.test.js','src/services/__tests__/payrollCategoryMigration.mysql.test.js'
]}};
