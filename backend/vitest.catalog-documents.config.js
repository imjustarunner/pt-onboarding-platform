import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{vitest:fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url))}},test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
 'src/services/__tests__/serviceCodeInventoryPresentation.test.js',
 'src/services/__tests__/testingCatalog.test.js',
 'src/services/__tests__/medicalServiceCatalogRead.test.js',
 'src/services/__tests__/testingCatalogClaimGuard.test.js',
 'src/controllers/__tests__/claimMdClinicalClaimVersions.test.js',
 'src/controllers/__tests__/claimMdBillingOffice.test.js'
]}};
