export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',env:{SKIP_DB_CONNECT:'1'},include:[
 'src/services/__tests__/tutoringIntakeScope.test.js',
 'src/services/__tests__/coGuardianTutoring.test.js',
 'src/services/__tests__/nluQaEnrollmentSender.test.js',
 'src/services/__tests__/nluQaNotificationsSender.test.js',
 'src/services/__tests__/nluQaMailboxOwnership.test.js',
 'src/services/__tests__/nluQaDomainInference.test.js',
 'src/services/__tests__/intakeAuthorization.test.js',
 'src/services/__tests__/enrollmentCompletion.confirmation.test.js'
]}};
