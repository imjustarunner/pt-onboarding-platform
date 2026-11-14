import {builtinModules} from 'node:module';
export default {
 root:new URL('.',import.meta.url).pathname,
 resolve:{alias:[{find:'vitest',replacement:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname},...builtinModules.filter(name=>!name.startsWith('node:')).map(name=>({find:name,replacement:`node:${name}`}))]},
 test:{environment:'node',include:[
  'src/services/__tests__/unsolicitedOutreach*.test.js',
  'src/services/__tests__/publicAgencySupport.qaCaptcha.test.js',
  'src/services/__tests__/publicProviderInquiry.test.js',
  'src/services/__tests__/ptcoInquiry.test.js',
  'src/services/__tests__/auricwellInquiry.test.js',
  'src/services/__tests__/itscoInternshipInquiry.test.js',
  'src/services/__tests__/messaging.agentDelivery.test.js',
  'src/services/__tests__/familyEmailRouting.test.js',
  'src/services/__tests__/unmonitoredMailbox.test.js',
  'src/services/__tests__/tenantMessageMailboxes*.test.js',
  'src/services/__tests__/messaging.groupRouting.test.js',
  'src/services/__tests__/messaging.departmentalGroups.test.js',
  'src/services/__tests__/messaging.schoolContactSend.test.js',
  'src/services/__tests__/messaging.senderSelection.test.js',
  'src/services/__tests__/messaging.verifiedSender.test.js',
  'src/services/__tests__/messaging.outboundSignature.test.js'
 ],restoreMocks:true}
};
