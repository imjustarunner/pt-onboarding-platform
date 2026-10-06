export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},
 test:{environment:'node',restoreMocks:true,include:['src/services/__tests__/passkeys*.test.js','src/utils/__tests__/passkeyPolicy.test.js','src/utils/__tests__/passwordPolicy.test.js','src/middleware/__tests__/accountSecurity.test.js','src/controllers/__tests__/accountSecurity.mysql.test.js','src/services/__tests__/sessionSecurity.service.test.js','src/utils/__tests__/brandSwitchLoginMemory.test.js','src/services/__tests__/passwordRecovery.service.test.js','src/services/__tests__/securityEvidence.startup.test.js'],testTimeout:20000}
};
