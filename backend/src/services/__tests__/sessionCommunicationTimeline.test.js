import {expect,it} from 'vitest';
import {sessionCommunicationTimeline} from '../sessionCommunicationTimeline.js';
it('shows failed, skipped and queued notification outcomes even without a successful-send log',()=>{
 const rows=sessionCommunicationTimeline(['failed','skipped','pending'].map((status,index)=>({id:index+1,status,channel:'email',scheduledFor:'2026-11-14 20:00:00',errorMessage:status==='failed'?'Mailbox rejected the email':null})),[]);
 expect(rows.map(row=>row.metadata.deliveryStatus)).toEqual(['failed','skipped','pending']);expect(rows[0].metadata.reason).toBe('Mailbox rejected the email');
});
it('replaces an outbound send log with its actual delivery row while retaining replies',()=>{
 const rows=sessionCommunicationTimeline([{id:4,status:'sent',channel:'email',sentAt:'2026-11-13 20:00:00'}],[{id:9,reminderId:4,direction:'outbound',bodyPreview:'Friendly reminder',metadata:{recipient:'parent@example.test'}},{id:10,reminderId:4,direction:'inbound',kind:'notification_reply',metadata:{body:'Thanks!'}}]);
 expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({category:'notifications',bodyPreview:'Friendly reminder',metadata:{deliveryStatus:'sent',recipient:'parent@example.test'}});expect(rows[1]).toMatchObject({category:'replies',metadata:{body:'Thanks!'}});
});
