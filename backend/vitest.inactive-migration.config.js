export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,include:[
  'src/services/__tests__/clientInactiveScheduling.test.js',
  'src/services/__tests__/clientLifecycleTaskSync.test.js',
  'src/services/__tests__/clientChartRecordsStatus.test.js',
  'src/services/__tests__/noteworthyLifecycle.test.js'
 ]}
};
