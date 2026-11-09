import {it,expect} from 'vitest';
import {pollDeliveryHistory} from '../staffPollDeliveryHistory.js';
const base={users:[{id:1,first_name:'Paige'}],views:[],responses:[],logs:[],smsDeliveries:[]};
it('explains an app reply that arrived before invitations without inventing a delivery or viewed time',()=>{
 const result=pollDeliveryHistory({...base,responses:[{user_id:1,source:'in_app',received_at:'2026-11-09T18:40:22Z'}]});
 expect(result.recipients[0]).toMatchObject({status:'answered',answeredAt:'2026-11-09T18:40:22Z',lastViewedAt:null});expect(result.recipients[0].explanation).toContain('no additional invitation');expect(result.logs).toEqual([]);
});
it('combines transport receipts with the matching invitation without duplicating it',()=>{
 const result=pollDeliveryHistory({...base,logs:[{id:1,userId:1,channel:'sms',dispatchType:'vote_invite',twilioSid:'provider-1',status:'sent',sentAt:'2026-11-09T19:48:20Z'}],smsDeliveries:[{id:4,userId:1,providerMessageId:'provider-1',status:'delivered',deliveredAt:'2026-11-09T19:48:23Z'}]});
 expect(result.logs).toHaveLength(1);expect(result.logs[0]).toMatchObject({status:'delivered',deliveredAt:'2026-11-09T19:48:23Z',sentAt:'2026-11-09T19:48:20Z'});
});
it('does not use updated_at or a later response as a historical delivery receipt time',()=>{
 const result=pollDeliveryHistory({...base,smsDeliveries:[{id:4,status:'delivered',respondedAt:'2026-11-09T20:05:54Z',updatedAt:'2026-11-09T20:05:54Z'}]});expect(result.logs[0].deliveredAt).toBeUndefined();
});
it('updates a queued email from its exact communication record after approval without confusing another follow-up',()=>{
 const result=pollDeliveryHistory({...base,logs:[{id:1,userId:1,channel:'email',status:'queued',communicationId:44},{id:2,userId:1,channel:'email',status:'queued',communicationId:45}],emailDeliveries:[{id:44,user_id:1,delivery_status:'sent',sent_at:'2026-11-09T19:00:00Z'}]});
 expect(result.logs.find(row=>row.id===1)).toMatchObject({status:'sent',sentAt:'2026-11-09T19:00:00Z'});expect(result.logs.find(row=>row.id===2).status).toBe('queued');
});
