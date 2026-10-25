import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowQaExchangeRecipient } from '../auricwellQaPolicy.js';
const agency = {slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviderUserId:1433}}};
const provider = {id:1433,is_demo:1,email:'qa.provider.auricwell@example.com'};
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
