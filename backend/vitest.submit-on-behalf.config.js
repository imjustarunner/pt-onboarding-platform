import base from './vitest.outreach-integration.config.js';
export default {...base,test:{...base.test,include:[...base.test.include,'src/routes/__tests__/submitOnBehalf.test.js','src/services/__tests__/manualMeetingLog*.test.js']}};
