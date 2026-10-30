export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
  'src/services/__tests__/providerAmendmentCompletion.test.js',
  'src/services/__tests__/documentCountersignTasks.test.js',
  'src/services/__tests__/documentTaskEnrichment.test.js',
  'src/controllers/__tests__/documentSignerAccess.test.js',
  'src/controllers/__tests__/providerUpdateAmendmentReview.test.js'
 ]}
};
