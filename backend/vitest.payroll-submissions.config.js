export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    execArgv: ['--experimental-sqlite'],
    include: [
      'src/services/__tests__/payrollTutoringClassification.test.js',
      'src/controllers/__tests__/payrollSubmissions.test.js',
      'src/controllers/__tests__/payrollApprovedVisibility.test.js',
      'src/services/__tests__/supervisionUnpaidHours.test.js',
      'src/services/__tests__/hourlySupervisionPay.test.js',
      'src/services/__tests__/events.checkin.test.js',
      'src/controllers/__tests__/supervisionPayrollRates.test.js',
      'src/controllers/__tests__/supplementalPayrollRates.test.js',
      'src/services/__tests__/supervisionPayrollCorrection.test.js'
    ]
  }
};
