export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},fileParallelism:false,include:[
 'src/services/__tests__/noteAidIntakeSources.test.js','src/services/__tests__/recordDownloadSecurity.test.js','src/services/__tests__/intakeBriefingPrivacy.test.js','src/services/__tests__/clinicalNoteWriter.test.js','src/services/__tests__/sessionAiPrivacy.test.js','src/services/__tests__/auditEvent.target.test.js'
]}};
