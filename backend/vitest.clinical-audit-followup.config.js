import prior from './vitest.qa-core-repairs.config.js';
export default { ...prior, test: { ...prior.test, include: [
  'src/services/__tests__/contactReminderSmsConsent.test.js',
  'src/services/__tests__/clientContactAffiliation.schema.test.js',
  'src/services/__tests__/sessionNotification.service.test.js',
  'src/services/__tests__/messaging.compliance.test.js',
  'src/services/__tests__/scheduling.reminderUtc.test.js',
  'src/services/__tests__/coGuardianReminderPolicy.test.js'
] } };
