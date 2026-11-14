import base from './vitest.nlu-ui-refresh.config.js';
export default {...base,test:{...base.test,include:[...new Set([...base.test.include,
'src/services/__tests__/clinicalServiceScope.test.js','src/services/__tests__/scheduling.*.test.js','src/services/mobile/__tests__/qaScope.test.js','src/controllers/__tests__/taskReport.test.js','src/controllers/__tests__/taskSearchRanking.test.js','src/controllers/__tests__/paperPacketTaskAccess.test.js','src/services/__tests__/taskAdministratorAccess.test.js','src/controllers/__tests__/taskAdministratorScope.test.js',
'src/services/__tests__/guardianEnrollmentStart.test.js','src/services/__tests__/guardianTutoringDrafts.test.js',
'src/services/__tests__/employeeCompensationSigning.test.js'
])]}};
