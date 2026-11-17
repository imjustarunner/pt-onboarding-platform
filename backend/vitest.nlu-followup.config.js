import base from './vitest.nlu-immediate-office.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,
 'src/services/__tests__/childcare.*.test.js',
 'src/services/__tests__/employeeCompensation*.test.js',
 'src/services/__tests__/compensationDraft*.test.js',
 'src/services/__tests__/scheduling.scheduleNoticeBuffer.test.js',
 'src/services/__tests__/scheduling.replacementRooms.test.js',
 'src/services/__tests__/scheduling.officeRequestEmails.test.js',
 'src/services/__tests__/familyBillingPolicy.test.js',
 'src/services/__tests__/clientBillingAccount.test.js'
]}};
