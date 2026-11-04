import {fileURLToPath} from 'node:url';
export default {
 resolve:{alias:{vitest:fileURLToPath(new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url))}},
 test:{environment:'node',include:[
  'src/middleware/__tests__/auricwellPreview.test.js',
  'src/routes/__tests__/auricwellPreviewToasts.test.js',
  'src/services/__tests__/auricwellPreviewPolicy.test.js',
  'src/services/__tests__/claimMdAmendment.test.js',
  'src/services/__tests__/claimMdServiceChanges.test.js',
  'src/services/__tests__/claimMdNoteImmutability.test.js',
  'src/services/__tests__/claimMdContentReview.test.js',
  'src/services/__tests__/sessionAiPrivacy.test.js'
 ],env:{NODE_ENV:'test',SKIP_DB_CONNECT:'1'},pool:'forks',maxWorkers:1,minWorkers:1,fileParallelism:false}
};
