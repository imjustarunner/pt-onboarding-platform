import {defineConfig} from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',maxWorkers:2,include:[
 'src/services/__tests__/clientChartTypes.mysql.test.js','src/services/__tests__/clientFiscalSessions.test.js','src/services/__tests__/sessionCountImport.mysql.test.js',
 'src/controllers/__tests__/payrollBillingProfileParser.test.js','src/controllers/__tests__/clientGuardianPortalModes.test.js'
]}});
