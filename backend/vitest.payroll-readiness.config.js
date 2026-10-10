export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: [
      'src/services/__tests__/compensation*.test.js',
      'src/services/__tests__/serviceCreditPolicy.test.js',
      'src/services/__tests__/roleCompensation.test.js',
      'src/services/__tests__/supplementalLeave*.test.js',
      'src/services/__tests__/meetingCompensationPolicy.test.js',
      'src/controllers/__tests__/activityProtection.payroll.test.js',
      'src/services/__tests__/payrollReadiness.test.js',
      'src/utils/__tests__/payrollLeaveExport.test.js',
      'src/controllers/__tests__/payrollLeaveExport.test.js'
    ]
  }
};
