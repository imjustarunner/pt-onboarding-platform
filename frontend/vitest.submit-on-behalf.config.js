import base from './vitest.outreach-integration.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,
 'src/components/dashboard/__tests__/SubmitOnBehalf.test.js'
]}};
