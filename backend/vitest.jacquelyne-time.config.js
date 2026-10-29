export default {
 root: new URL('.', import.meta.url).pathname,
 resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
 test: { environment: 'node', execArgv: ['--experimental-sqlite'], include: [
  'src/services/__tests__/jacquelyneTime.test.js',
  'src/services/__tests__/meetingClaimRate.test.js',
  'src/services/__tests__/meetingCompensationPolicy.test.js',
  'src/controllers/__tests__/supplementalPayrollRates.test.js',
  'src/services/__tests__/events.travelReport.test.js'
 ] }
};
