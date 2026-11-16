import { defineConfig } from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment:'node', include:[
    'src/services/__tests__/chartPasteParser.test.js', 'src/services/__tests__/chartContactOwnership.test.js', 'src/services/__tests__/clientChartImport*.test.js',
    'src/services/__tests__/clientContactAffiliation.schema.test.js',
    'src/controllers/__tests__/clientChart*.test.js', 'src/controllers/__tests__/clientInsuranceSupport.test.js',
    'src/controllers/__tests__/clientInsuranceSources.test.js', 'src/services/__tests__/payerDirectorySelection.test.js'
  ] }
});
