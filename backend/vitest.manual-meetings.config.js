export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/manualMeetingLog.test.js','src/services/__tests__/meetingCompensationPolicy.test.js','src/services/__tests__/myMeetings.test.js','src/controllers/__tests__/meetingCompensationAccess.test.js']}
};
