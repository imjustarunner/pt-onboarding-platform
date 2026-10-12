export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: [
      'src/controllers/__tests__/supplementalPayrollRates.test.js',
      'src/services/__tests__/recurringPayroll.test.js',
      'src/services/__tests__/payrollSubmissionContext.test.js',
      'src/services/__tests__/supervisionPayrollCorrection.test.js',
      'src/services/__tests__/compensation*.test.js',
      'src/services/__tests__/serviceCreditPolicy.test.js',
      'src/services/__tests__/roleCompensation.test.js',
      'src/services/__tests__/supplementalLeave*.test.js',
      'src/services/__tests__/meetingCompensationPolicy.test.js',
      'src/controllers/__tests__/activityProtection.payroll.test.js',
      'src/services/__tests__/payrollReadiness.test.js',
      'src/services/__tests__/payrollTransition.test.js',
      'src/services/__tests__/payrollActivation.test.js',
      'src/utils/__tests__/payrollLeaveExport.test.js',
      'src/controllers/__tests__/payrollLeaveExport.test.js'
    ]
  }
};
