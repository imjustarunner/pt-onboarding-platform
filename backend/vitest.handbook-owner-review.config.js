import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{vitest:fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url))}},test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
 'src/content/__tests__/collectiveHandbookNovember2026.test.js',
 'src/services/__tests__/ownerReviewedHandbookRelease.test.js',
 'src/services/__tests__/nluCompensationPolicy.test.js',
 'src/services/__tests__/testingReferenceSeed.test.js'
]}};
