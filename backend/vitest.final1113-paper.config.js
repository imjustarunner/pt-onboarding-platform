import base from './vitest.paper-followup.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,'src/services/__tests__/coverageAdmission.assignments.test.js']}};
