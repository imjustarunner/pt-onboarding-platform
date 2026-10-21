export default {
 root:new URL('.',import.meta.url).pathname,
 test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},restoreMocks:true,include:[
 'src/services/__tests__/privateOfficeDemoAccess.test.js','src/services/__tests__/tutoringOfficeWindow.test.js','src/services/__tests__/officeWaitingMessages.test.js','src/services/__tests__/learningRecordAccess.test.js','src/services/__tests__/tutoringBinder.test.js','src/services/__tests__/tutoringOffice.test.js',
 'src/services/__tests__/tutoringAppointmentWorkspace.test.js','src/services/__tests__/tutoringStudentAccess.test.js',
 'src/services/__tests__/clientServiceEnrollment.test.js',
 'src/services/__tests__/meetingOfficeAccess.test.js','src/services/__tests__/meetingTenantOffice.test.js',
 'src/services/__tests__/meetingOfficePresentation.test.js'
 ]}
};
