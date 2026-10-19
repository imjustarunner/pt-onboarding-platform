import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationDefaults, cleanPlatformSettings } from './integrationPolicy.js';
import { runtimeIntegrationSecrets } from './integrationSecrets.js';
import { CONSENT_VERSION, consentPhone, assertVerificationReady, verificationMessage } from './verificationSmsPolicy.js';
test('verification requires affirmative versioned consent and US mobile input',()=>{
 assert.equal(consentPhone({phone:'719-555-0123',consent:true,consentVersion:CONSENT_VERSION}),'+17195550123');
 for(const input of [{phone:'7195550123'},{phone:'7195550123',consent:true,consentVersion:'old'},{phone:'invalid',consent:true,consentVersion:CONSENT_VERSION}])assert.throws(()=>consentPhone(input),{status:400});
});
test('verification campaign is platform scoped and cannot share an agency number or bypass approval',()=>{
 const current=integrationDefaults();
 const ready={...current,notifyre:{...current.notifyre,apiToken:'test',baaReference:'test',webhookSecret:'test',webhookVerifiedAt:'now'},verificationSms:{enabled:true,from:'+17195550123',campaignId:'2fa',approval:'approved',approvalReference:'test',verifiedAt:'now',carrierKeywordsConfirmed:true}};
 assert.equal(assertVerificationReady(ready).campaignId,'2fa');
 for(const key of ['enabled','verifiedAt','approvalReference','carrierKeywordsConfirmed'])assert.throws(()=>assertVerificationReady({...ready,verificationSms:{...ready.verificationSms,[key]:false}}),{status:409});
 assert.throws(()=>cleanPlatformSettings({...ready,verificationSms:{...ready.verificationSms,from:'+17195550124'}},ready),{status:409});
 assert.throws(()=>cleanPlatformSettings({...current,notifyre:{...current.notifyre,from:'+17195550123'},verificationSms:{...ready.verificationSms,enabled:false}},current),{status:400});
 const rotated=runtimeIntegrationSecrets(ready,{AURICWELL_NOTIFYRE_API_TOKEN:'changed'});assert.equal(rotated.verificationSms.enabled,false);assert.equal(rotated.verificationSms.verifiedAt,null);
});
test('verification texts match the submitted code-only purposes',()=>{
 assert.match(verificationMessage('signin','482913'),/^AuricWell: Your sign-in verification code is 482913/);
 assert.match(verificationMessage('recovery','739251'),/account recovery code is 739251/);
 assert.match(verificationMessage('enroll','123456'),/Reply STOP to opt out\.$/);
});
