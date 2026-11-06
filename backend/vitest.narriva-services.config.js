export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/services/__tests__/narrivaServiceReference.test.js',
  'src/services/__tests__/narrivaServicePublication.mysql.test.js',
  'src/services/__tests__/bachelorsServiceCodePolicy.test.js',
  'src/services/__tests__/clinicalIntegration.catalogPreservation.test.js'
 ],fileParallelism:false,testTimeout:15000,hookTimeout:15000}
};
