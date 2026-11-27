import { fileURLToPath } from 'node:url';
export default { root: fileURLToPath(new URL('..',import.meta.url)), test: {
  environment:'node',pool:'threads',maxWorkers:1,
  include:[
    'backend/src/services/__tests__/plotlineHiringJourney*.test.js',
    'backend/src/services/__tests__/hire.communications.test.js',
    'backend/src/services/__tests__/hire.notificationDelivery.test.js',
    'backend/src/services/__tests__/hire.interviewSms.test.js',
    'backend/src/services/__tests__/hire.platformInterviewSms.test.js',
    'backend/src/services/__tests__/hire.interviewSchedule.test.js',
    'backend/src/services/__tests__/hire.interviewReschedule.test.js',
    'backend/src/services/__tests__/hire.referenceConsent.test.js',
    'backend/src/services/__tests__/hire.referenceCompletionEmail.test.js',
    'backend/src/services/__tests__/hire.referenceTerminalState.test.js',
    'backend/src/services/__tests__/messaging.compliance.test.js',
    'backend/src/services/__tests__/messaging.carrierCompliance.test.js',
    'backend/src/services/__tests__/messaging.smsCarrierBoundary.test.js',
    'backend/src/services/__tests__/messaging.vonageTransport.test.js',
    'backend/src/services/__tests__/hire.peopleOperationsObserver.test.js',
    'backend/src/services/__tests__/messaging.smsPublicConsent.test.js'
  ]
} };
