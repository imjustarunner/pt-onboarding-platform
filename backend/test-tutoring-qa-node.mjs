import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const tests=['staffLearningCompensation','learningEnrollmentPricing','learningCatalog'];
const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--test',...tests.map(name=>fileURLToPath(new URL(`./src/services/__tests__/${name}.test.js`,import.meta.url)))],{stdio:'inherit'});
process.exit(result.status??1);
