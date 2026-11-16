import paper from './vitest.paper-followup.config.js';
export default {...paper,test:{...paper.test,env:{NODE_ENV:'test',SKIP_DB_CONNECT:'1',SKIP_CLINICAL_DB_CONNECT:'1'},include:[...paper.test.include,
 'src/utils/__tests__/clientOfficeOrganization.test.js','src/utils/__tests__/clientDirectoryPage.test.js','src/services/__tests__/packetWorkspace.mysql.test.js',
 'src/controllers/__tests__/notificationPerformance.test.js','src/services/__tests__/hire.contract.test.js',
 'src/services/__tests__/clientExchangeSummary.test.js','src/content/__tests__/nluContractCredentialSelection.test.js'
]}};
