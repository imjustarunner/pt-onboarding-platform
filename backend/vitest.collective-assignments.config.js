import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { vitest: fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url)) } },
  test: { environment: 'node', env: { SKIP_DB_CONNECT: '1' }, restoreMocks: true, include: [
    'src/services/__tests__/hire.collectiveAssignments.test.js',
    'src/services/__tests__/hire.roleMerge.test.js',
    'src/services/__tests__/hire.agreementBuilder.test.js',
    'src/services/__tests__/hire.contract.test.js',
    'src/services/__tests__/hire.contractSigning.test.js',
    'src/services/__tests__/hire.childcareTerms.test.js'
  ] }
};
