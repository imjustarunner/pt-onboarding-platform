import { builtinModules } from 'node:module';
export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:[{find:'vitest',replacement:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname},...builtinModules.filter(name=>!name.startsWith('node:')).map(name=>({find:name,replacement:`node:${name}`}))]},test:{environment:'node',include:[
'src/services/__tests__/scheduling.officeApproval*.test.js',
'src/controllers/__tests__/scheduling.officeApprovalDecision.test.js',
'src/services/__tests__/scheduling.officeRequestEmails.test.js',
'src/services/__tests__/scheduling.officeMoveApproval.test.js',
'src/services/__tests__/scheduling.officeApprovalCalendarSync.test.js',
'src/services/__tests__/tenantMessageMailboxes*.test.js'
],restoreMocks:true}};
