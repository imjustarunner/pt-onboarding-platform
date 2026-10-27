import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowQaExchangeRecipient, allowQaSmsDelivery } from '../auricwellQaPolicy.js';
const agency = {slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:1433}}};
const provider = {id:1433,is_demo:1,email:'qa.provider.auricwell@example.com'};
test('QA SMS admits approved purposes only to the owner’s test phone',()=>{
 const qa={...agency,id:450};const options={to:'+16189107000',purpose:'workforce'};
 assert.equal(allowQaSmsDelivery(qa,options),true);
 for(const purpose of ['care','reminders']) assert.equal(allowQaSmsDelivery(qa,{...options,purpose,clientId:2259}),true);
 for(const patch of [{purpose:'marketing'},{purpose:'billing'},{purpose:'account_security'},{to:'+15555550100'}])assert.equal(allowQaSmsDelivery(qa,{...options,...patch}),false);
 assert.equal(allowQaSmsDelivery({...qa,feature_flags:null},options),false);
 assert.equal(allowQaSmsDelivery({...qa,id:452,slug:'auricwell-qa-demo-clinic'},options),false);
 assert.equal(allowQaSmsDelivery({id:2,slug:'itsco'},{purpose:'care',to:'+15555550100'}),true);
});
test('QA allows only its explicitly configured demo provider',()=>{
  assert.equal(allowQaExchangeRecipient(agency,provider),true);
  for (const user of [{...provider,id:1434},{...provider,is_demo:0},{...provider,email:'real@example.org'},null])
    assert.equal(allowQaExchangeRecipient(agency,user),false);
});
test('QA fails closed for missing or corrupt policy',()=>{
  for (const feature_flags of [null,'{broken}',{}, {qaSandbox:{exchangeProviderUserId:1433}}])
    assert.equal(allowQaExchangeRecipient({...agency,feature_flags},provider),false);
  assert.equal(allowQaExchangeRecipient({...agency,feature_flags:JSON.stringify(agency.feature_flags)},provider),true);
});
test('unrelated tenants retain their notification policy',()=>{
  assert.equal(allowQaExchangeRecipient({slug:'unrelated'},{id:12,is_demo:0}),true);
});
test('an explicit roster permits only its synthetic providers, up to ten',()=>{
  const roster=Array.from({length:10},(_,i)=>({id:1500+i,email:`qa.provider.${i}@example.com`}));
  const qa={...agency,feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:roster}}};
  for(const entry of roster)assert.equal(allowQaExchangeRecipient(qa,{...entry,is_demo:1,role:'provider'}),true);
  for(const user of [{...roster[0],is_demo:0,role:'provider'},{...roster[0],is_demo:1,role:'support'},{...roster[0],id:9999,is_demo:1,role:'provider'}])assert.equal(allowQaExchangeRecipient(qa,user),false);
  for(const exchangeProviders of [[],null,[...roster, {id:1600,email:'qa.provider.extra@example.com'}],[roster[0],roster[0]],[{id:1500,email:'real@clinic.test'}]])
    assert.equal(allowQaExchangeRecipient({...qa,feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders}}},{...roster[0],is_demo:1,role:'provider'}),false);
});
