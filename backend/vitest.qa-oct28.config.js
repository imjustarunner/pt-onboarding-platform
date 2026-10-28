export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',restoreMocks:true,include:[
'src/services/__tests__/schoolStaffPhone.test.js',
'src/controllers/__tests__/schoolStaffPhone.test.js',
'src/services/__tests__/schoolStaffWelcomeEmail.test.js',
'src/services/__tests__/publicEnrollmentPolicyAccess.test.js'
]}};
