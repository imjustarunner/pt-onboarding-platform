export default {
  root:new URL('.',import.meta.url).pathname,
  resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
  test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},include:[
    'src/services/__tests__/hire.jobInterview*.test.js',
    'src/services/__tests__/hire.interviewSchedule.test.js',
    'src/services/__tests__/interviewOpeners.test.js'
  ]}
};
