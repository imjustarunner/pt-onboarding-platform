export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},fileParallelism:false,include:[
  'src/services/__tests__/tutoringSessionChecklist.test.js',
  'src/services/__tests__/tutoringSessionPdf.test.js',
  'src/models/__tests__/tutoringSessionLearning.documentation.test.js',
  'src/services/__tests__/bookedTutoringRoom.test.js',
  'src/services/__tests__/clinicalRecordPdf.test.js',
  'src/services/__tests__/clinicalRecordExport.test.js'
 ]}
};
