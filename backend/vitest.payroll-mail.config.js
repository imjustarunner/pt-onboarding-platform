export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', maxWorkers: 1, include: [
    'src/services/__tests__/payrollReportEmail.test.js',
    'src/services/__tests__/payrollReportInbox.test.js',
    'src/services/__tests__/payrollTicketNotifications.test.js',
    'src/services/__tests__/messaging.attachments.test.js',
    'src/services/__tests__/noteworthyAccountEmail.test.js',
    'src/services/__tests__/genericUploadsPayrollPrivacy.test.js'
  ] }
};
