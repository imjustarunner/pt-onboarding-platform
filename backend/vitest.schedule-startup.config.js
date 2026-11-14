import { builtinModules } from 'node:module';
export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:[{find:'vitest',replacement:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname},...builtinModules.filter(name=>!name.startsWith('node:')).map(name=>({find:name,replacement:`node:${name}`}))]},
 test:{environment:'node',include:['src/services/__tests__/scheduling.googleOverlayProjection.test.js','src/controllers/__tests__/meetingCompensationAccess.test.js','src/services/__tests__/meetingCompensationPolicy.test.js','src/services/__tests__/meetingClaimRate.test.js','src/services/__tests__/scheduleSummaryPrivacy.service.test.js'],restoreMocks:true}
};
