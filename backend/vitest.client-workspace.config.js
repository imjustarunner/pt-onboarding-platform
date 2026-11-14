export default { root:new URL('.',import.meta.url).pathname, test:{execArgv:['--experimental-sqlite'],environment:'node',include:[
'src/services/__tests__/paperPacketProcessing.test.js',
'src/controllers/__tests__/clientGuardianContact.test.js',
'src/controllers/__tests__/clientExchange.test.js',
'src/services/__tests__/linkedGuardianContact.test.js',
'src/services/__tests__/clientAffiliationMerge.test.js',
'src/services/__tests__/clientEnrollmentMerge.test.js',
'src/services/__tests__/clientContactPolicy.test.js',
'src/services/__tests__/clientContactGuardianInvite.test.js',
'src/services/__tests__/clientContactAffiliation.schema.test.js',
'src/services/__tests__/contactReminderSmsConsent.test.js',
'src/utils/__tests__/clientCode.test.js',
'src/utils/__tests__/clientDemoFilter.test.js',
'src/utils/__tests__/guardianPortalLinkState.test.js'
],restoreMocks:true} };
