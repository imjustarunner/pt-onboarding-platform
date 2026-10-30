export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',include:[
 'src/services/__tests__/qaOct29.enrollment.test.js',
 'src/services/__tests__/enrollmentCompletion.confirmation.test.js',
 'src/services/__tests__/enrollmentCompletion.portalBranding.test.js',
 'src/services/__tests__/guardianAccess.packetCompletion.test.js',
 'src/services/__tests__/scheduling.enrollmentProviderSelection.test.js'
]}};
