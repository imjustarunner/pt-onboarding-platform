import base from './vitest.nlu-office-hiring.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,'src/content/__tests__/nluContractCredentialSelection.test.js','src/content/__tests__/providerRolesNovember2026.test.js','src/content/__tests__/contractServiceRoles.test.js']}};
