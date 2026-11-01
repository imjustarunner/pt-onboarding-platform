import regression from './vitest.clinical-audit-regression.config.js';
import carrier from './vitest.sms-carrier.config.js';
export default {...regression,test:{...regression.test,include:[...new Set([...regression.test.include,...carrier.test.include,
 'src/services/__tests__/staffVerbalReminderConsent.test.js',
 'src/services/__tests__/emailMobileLayout.test.js',
 'src/services/__tests__/smsConsentVerbalGate.test.js',
 'src/services/__tests__/scheduling.cancellationOutreach.test.js',
 'src/services/__tests__/messaging.outboundSignature.test.js'
])]}};
