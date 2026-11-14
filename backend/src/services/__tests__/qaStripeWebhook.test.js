import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {assertQaStripeWebhookScope} from '../qaStripeWebhook.service.js';
const agency={id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}};
const event={type:'payment_intent.succeeded',account:'acct_qa',livemode:false,data:{object:{id:'pi_qa',livemode:false,metadata:{agency_id:'453'}}}};
it('accepts only a test event bound to the stored QA connected account',async()=>{
 const db={execute:vi.fn(async()=>[[agency]])};
 expect(await assertQaStripeWebhookScope(event,db)).toEqual({agencyId:453,connectedAccountId:'acct_qa'});
 expect(db.execute.mock.calls[0][1]).toEqual(['acct_qa']);
});
it.each(['live event','live object','wrong organization','unknown account','duplicate binding'])('rejects %s before processing any payment',async reason=>{
 const input=structuredClone(event),rows=[agency];
 if(reason==='live event')input.livemode=true;
 if(reason==='live object')input.data.object.livemode=true;
 if(reason==='wrong organization')input.data.object.metadata.agency_id='6';
 if(reason==='unknown account')rows.length=0;
 if(reason==='duplicate binding')rows.push({...agency,id:450});
 await expect(assertQaStripeWebhookScope(input,{execute:async()=>[rows]})).rejects.toHaveProperty('status',400);
});
it('accepts a direct QA test event only when its organization is explicitly verified',async()=>{
 const input=structuredClone(event);delete input.account;
 expect(await assertQaStripeWebhookScope(input,{execute:async()=>[[agency]]})).toEqual({agencyId:453,connectedAccountId:null});
 input.data.object.metadata.agency_id='6';
 await expect(assertQaStripeWebhookScope(input,{execute:async()=>[[agency]]})).rejects.toHaveProperty('status',400);
});
