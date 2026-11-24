export default {root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:['src/services/__tests__/transitionMeetingSequence.test.js','src/services/__tests__/transitionMeetingSequenceDispatch.test.js','src/services/__tests__/transitionMeetingDeliveryReceipt.test.js','src/services/__tests__/transitionMeetingWorkerIsolation.test.js','src/services/__tests__/transitionMeetingPreviewScope.test.js']}};
