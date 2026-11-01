import regression from './vitest.clinical-audit-regression.config.js';
export default {...regression,test:{...regression.test,include:[...new Set([...regression.test.include,
 'src/services/__tests__/schoolOnboardingReminders.test.js',
 'src/services/__tests__/familyPortalEmail.migrationBenefits.test.js',
 'src/services/__tests__/scheduling.officeRequestEmails.test.js',
 'src/services/__tests__/supervisionEmailDelivery.test.js',
 'src/services/__tests__/familyPortalEmail.onboardingReminders.test.js',
 'src/services/__tests__/insuranceCards.reminders.test.js',
]) ]}};
