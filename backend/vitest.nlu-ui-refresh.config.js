import base from './vitest.nlu-retest.config.js';
export default {...base,test:{...base.test,include:[...new Set([...base.test.include,
 'src/services/__tests__/inPersonLearningWorkspace.test.js',
 'src/services/__tests__/tutoringAppointmentWorkspace.test.js',
 'src/services/__tests__/learningGuardianMessages.test.js',
 'src/utils/__tests__/publicErrorMessage.test.js',
 'src/services/__tests__/enrollmentResumeEmail.test.js',
 'src/services/__tests__/tutoringBillingTerms.test.js',
 'src/services/__tests__/inPersonTutoringContext.test.js',
 'src/services/__tests__/stripePaymentContext.test.js',
 'src/services/__tests__/qaStripeWebhook.test.js',
 'src/services/__tests__/qaStripePaymentGuard.test.js',
 'src/services/__tests__/stripeAgencyFees.test.js',
 'src/middleware/__tests__/paymentAccount.test.js',
 'src/services/__tests__/qaPaymentSimulator.test.js',
 'src/services/__tests__/qaReadiness.test.js',
 'src/services/__tests__/qaLedgerSettlement.test.js',
 'src/services/__tests__/copayReceipts.test.js'
])]}};
