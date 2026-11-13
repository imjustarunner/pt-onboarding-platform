import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{vitest:fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url))}},test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
 'src/services/__tests__/testingServicePolicy.test.js',
 'src/services/__tests__/testingReferenceSeed.test.js',
 'src/services/__tests__/testingCatalog.test.js',
 'src/services/__tests__/nluCompensationPolicy.test.js',
 'src/services/__tests__/hire.contractServiceRoles.test.js',
 'src/services/__tests__/hire.categoryLevelTerms.test.js',
 'src/services/__tests__/hire.roleMerge.test.js',
 'src/services/__tests__/payrollSubmissionContext.test.js',
 'src/services/__tests__/payrollTransition.test.js',
 'src/services/__tests__/serviceCreditPolicy.test.js',
 'src/services/__tests__/compensationCarryover.test.js',
 'src/services/__tests__/bachelorsServiceCodePolicy.test.js',
 'src/services/__tests__/scheduling.careEligibility.test.js',
 'src/controllers/__tests__/staffTenantCards.test.js',
 'src/content/__tests__/providerRolesNovember2026.test.js'
]}};
