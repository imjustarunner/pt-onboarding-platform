import base from './vitest.nlu-immediate-office.config.js';
export default {...base,test:{...base.test,testTimeout:120000,hookTimeout:120000,include:[...base.test.include,
 'src/services/__tests__/childcare.*.test.js',
 'src/services/__tests__/employeeCompensation*.test.js',
 'src/services/__tests__/compensationDraft*.test.js',
 'src/services/__tests__/scheduling.scheduleNoticeBuffer.test.js',
 'src/services/__tests__/scheduling.noShowReview.test.js',
 'src/services/__tests__/attendanceFeeRules.test.js',
 'src/services/__tests__/appointmentProviderNoticeRecipient.test.js',
 'src/services/__tests__/attendance.mysql.test.js',
 'src/models/__tests__/attendanceFeePolicy.model.test.js',
 'src/services/__tests__/bookingCancellationPolicy.service.test.js',
 'src/services/__tests__/scheduling.changeWorkflow.test.js',
 'src/services/__tests__/scheduling.replacementRooms.test.js',
 'src/services/__tests__/scheduling.officeRequestEmails.test.js',
 'src/services/__tests__/familyBillingPolicy.test.js',
 'src/services/__tests__/clientBillingAccount.test.js'
]}};
