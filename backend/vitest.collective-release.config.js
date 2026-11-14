import {fileURLToPath} from 'node:url';
import hiring from './vitest.hire.config.js';
import contracts from './vitest.collective-assignments.config.js';
import catalog from './vitest.catalog-documents.config.js';
import futureHire from './vitest.future-hire-pay.config.js';
export default {
  root:fileURLToPath(new URL('.',import.meta.url)),
  resolve:{alias:{vitest:fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url))}},
  test:{environment:'node',restoreMocks:true,env:{SKIP_DB_CONNECT:'1',SKIP_CLINICAL_DB_CONNECT:'1'},include:[...new Set([
    ...hiring.test.include,...contracts.test.include,...catalog.test.include,...futureHire.test.include,
    'src/services/__tests__/schoolSupportRequestLimits.test.js',
    'src/services/__tests__/scheduling.schoolSupport.test.js',
    'src/controllers/__tests__/scheduling.schoolSupportAccess.test.js',
    'src/services/__tests__/clinicalAfterHoursPolicy.test.js',
    'src/services/__tests__/supplementalLeavePolicy.test.js',
    'src/services/__tests__/employeeCompensationDraft.test.js',
    'src/services/__tests__/compensationDraft.test.js',
    'src/services/__tests__/compensationDraft.create.test.js',
    'src/services/__tests__/compensationDraft.release.test.js'
  ])]}
};
