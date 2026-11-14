import base from './vitest.nlu-ui-refresh.config.js';
export default {...base,test:{...base.test,include:[...new Set([...base.test.include,
'src/utils/__tests__/nluWorkspace.test.js','src/components/guardian/__tests__/GuardianEnrollmentStart.test.js','src/components/learning/__tests__/LearningEnrollment.test.js'
])]}};
