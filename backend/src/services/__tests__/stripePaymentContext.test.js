import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {stripePaymentConfiguration} from '../stripePaymentContext.service.js';
import {stripeConfiguration} from '../../utils/qaStripeConfiguration.js';
const qa=id=>({id,slug:id===450?'auricwell-qa-demo':id===453?'nlu-qa-demo':'nlu-qa-learning',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}},stripe_connect_account_id:'acct_qa'});
beforeEach(()=>{
 vi.stubEnv('STRIPE_SECRET_KEY','sk_live_normal');vi.stubEnv('STRIPE_PUBLISHABLE_KEY','pk_live_normal');
 vi.stubEnv('QA_STRIPE_TEST_SECRET_KEY','sk_test_isolated');vi.stubEnv('QA_STRIPE_TEST_PUBLISHABLE_KEY','pk_test_isolated');
});
afterEach(()=>vi.unstubAllEnvs());
it.each([450,453,454])('uses the dedicated test pair only for verified QA organization %s',async id=>{
 const db={execute:vi.fn(async()=>[[qa(id)]])};
 const config=await stripePaymentConfiguration({agencyId:id,connectedAccountId:'acct_qa'},db);
 expect(config).toMatchObject({mode:'test',allowed:true,dedicated:true,secret:'sk_test_isolated'});
 expect(db.execute.mock.calls[0][1]).toEqual([id]);
});
it('uses the stored connected account association when a setup/refund call has no explicit agency',async()=>{
 const db={execute:vi.fn(async()=>[[qa(453)]])};
 expect((await stripePaymentConfiguration({connectedAccountId:'acct_qa'},db)).secret).toBe('sk_test_isolated');
 expect(db.execute.mock.calls[0][1]).toEqual(['acct_qa']);
});
it('never switches ordinary production payments to the QA key',async()=>{
 const db={execute:vi.fn(async()=>[[]])};
 expect((await stripePaymentConfiguration({connectedAccountId:'acct_normal',agencyId:6},db)).secret).toBe('sk_live_normal');
 expect(stripeConfiguration(6).publishable).toBe('pk_live_normal');
});
it.each(['no keys','partial pair','live QA keys','placeholder'])('fails closed for %s without using the global live key',async mode=>{
 if(mode==='no keys'){vi.stubEnv('QA_STRIPE_TEST_SECRET_KEY','');vi.stubEnv('QA_STRIPE_TEST_PUBLISHABLE_KEY','');}
 if(mode==='partial pair')vi.stubEnv('QA_STRIPE_TEST_PUBLISHABLE_KEY','');
 if(mode==='live QA keys'){vi.stubEnv('QA_STRIPE_TEST_SECRET_KEY','sk_live_wrong');vi.stubEnv('QA_STRIPE_TEST_PUBLISHABLE_KEY','pk_live_wrong');}
 if(mode==='placeholder')vi.stubEnv('QA_STRIPE_TEST_SECRET_KEY','sk_test_REPLACE_ME');
 await expect(stripePaymentConfiguration({agencyId:453},{execute:async()=>[[qa(453)]]})).rejects.toHaveProperty('code','QA_STRIPE_TEST_MODE_REQUIRED');
});
it.each(['wrong flags','wrong account','conflicting agency','duplicate account'])('rejects %s before reaching Stripe',async reason=>{
 const record=qa(453);if(reason==='wrong flags')record.feature_flags={};
 const db={execute:async()=>[reason==='duplicate account'?[record,qa(450)]:[record]]};
 const input=reason==='conflicting agency'?{agencyId:6,connectedAccountId:'acct_qa'}:reason==='duplicate account'?{connectedAccountId:'acct_qa'}:{agencyId:453,connectedAccountId:reason==='wrong account'?'acct_other':'acct_qa'};
 await expect(stripePaymentConfiguration(input,db)).rejects.toHaveProperty('code','QA_STRIPE_TEST_MODE_REQUIRED');
});
