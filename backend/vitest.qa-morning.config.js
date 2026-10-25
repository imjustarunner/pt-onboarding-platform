export default {root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',include:[
 'src/services/__tests__/intakeAuthorization.test.js',
 'src/services/__tests__/qaIntakeIdentity.test.js',
 'src/services/__tests__/scheduling.enrollmentProviderDirectory.test.js',
 'src/services/__tests__/guardianAccess.insurance.test.js',
 'src/services/__tests__/auricwellPreviewPolicy.test.js',
 'src/middleware/__tests__/auricwellPreview.test.js'
 ,'src/services/__tests__/messaging.compliance.test.js'
 ,'src/controllers/__tests__/companyDocumentLearning.controller.test.js'
 ,'src/services/__tests__/companyReferenceDocuments.test.js'
 ]}};
