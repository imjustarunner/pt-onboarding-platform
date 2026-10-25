export default { root: new URL('.', import.meta.url).pathname, resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } }, test: { environment: 'node', include: [
  'src/services/__tests__/qaRecipientEmail.test.js',
  'src/services/__tests__/clientOperationalStatus.test.js',
  'src/services/__tests__/clientAccountSupportAccess.test.js',
  'src/services/__tests__/clientAccountSupportBalance.test.js',
  'src/services/__tests__/clientExchange*.test.js',
  'src/controllers/__tests__/clientExchange.test.js',
  'src/services/__tests__/scheduling.schoolSupport.test.js',
  'src/controllers/__tests__/scheduling.schoolSupportAccess.test.js',
  'src/middleware/__tests__/supportContentAccess.test.js',
  'src/routes/__tests__/supportClinicalRoutes.test.js'
] } };
