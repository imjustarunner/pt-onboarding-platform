export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    env: { SKIP_DB_CONNECT: '1' },
    include: [
      'src/controllers/__tests__/clientTermination.test.js',
      'src/services/__tests__/clientTerminationDetails.test.js',
      'src/services/__tests__/clientTerminationSchoolYear.test.js',
      'src/services/__tests__/enrollmentFollowup.test.js',
      'src/services/__tests__/enrollmentFollowupReply.test.js',
      'src/services/__tests__/enrollmentFollowupReadiness.test.js',
      'src/services/__tests__/messaging.agentDelivery.test.js',
      'src/services/__tests__/messaging.enrollmentReply.test.js',
      'src/services/__tests__/unsolicitedOutreach.inboundAgent.test.js',
      'src/services/__tests__/scheduling.terminationRoster.test.js'
    ]
  }
};
