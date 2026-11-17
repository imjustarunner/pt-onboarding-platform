import {beforeEach,expect,it,vi} from 'vitest';
import {createSchoolWeekdayReminders,schoolWeekdayReminderReceipt} from '../schoolWeekdayReminders.service.js';
const now=new Date('2026-11-17T02:30:00Z');
const config={agency_id:2,owner_user_id:507,owner_email:'rachel@example.invalid',owner_name:'Rachel',sender_identity_id:6,from_email:'notifications@example.invalid',agency_name:'School agency',slug:'itsco'};
let rows,context,db,service,send,communication,settings,people,invitation;
beforeEach(()=>{
 rows=[];context={eligible:true,needsResponse:true,days:['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day,i)=>({day,status:i===0?'assigned':'unconfirmed',answered:false}))};invitation=true;
 settings=vi.fn(async()=>[config]);people=vi.fn(async()=>[{id:7,first_name:'Synthetic',email:'provider@example.invalid',work_email:'provider@example.invalid'}]);
 send=vi.fn(async()=>({id:'accepted'}));communication=vi.fn(async()=>({id:91}));
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),getConnection:async()=>db,execute:vi.fn(async(sql,args=[])=>{
  if(sql.includes('SELECT id FROM users'))return [[{id:7}]];
  if(sql.includes('SELECT id FROM school_weekday_followups'))return [invitation?[{id:4}]:[]];
  if(sql.startsWith('SELECT * FROM school_weekday_email_reminders')) {
   if(sql.includes('request_key=?'))return [[...rows.filter(r=>r.agency_id===args[0]&&r.provider_id===args[1]&&(r.request_key===args[2]||['pending','sending','review'].includes(r.status)||new Date(r.requested_at)>new Date(new Date(args[3]+'Z')-86400000))).slice(-1)]];
   return [rows.filter(r=>r.agency_id===args[0]&&r.status==='pending').map(r=>({...r}))];
  }
  if(sql.startsWith('INSERT INTO school_weekday_email_reminders')){const row={id:rows.length+1,agency_id:args[0],provider_id:args[1],requested_by_user_id:args[2],request_key:args[3],mode:args[4],requested_at:args[5]+'Z',status:'pending'};rows.push(row);return [{insertId:row.id}];}
  if(sql.startsWith('INSERT INTO provider_public_profiles')){context.reconfirmationPending=true;context.needsResponse=true;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE INTO school_weekday_followups')||sql.startsWith('INSERT INTO notifications')||sql.startsWith('UPDATE user_communications'))return [{affectedRows:1}];
  if(sql.includes("status='review'")&&sql.includes("status='sending'"))return [{affectedRows:0}];
  const row=rows.find(r=>r.id===args.at(-2));
  if(sql.includes("SET status='sending'")){if(!row||row.status!=='pending')return [{affectedRows:0}];row.status='sending';return [{affectedRows:1}];}
  if(sql.includes("SET status='cancelled'")){row.status='cancelled';return [{affectedRows:1}];}
  if(sql.includes('SET communication_id=')){row.communication_id=args[0];return [{affectedRows:1}];}
  if(sql.includes('SET status=?')){row.status=args[0];row.sent_at=args[1];row.last_error=args[2];return [{affectedRows:1}];}
  if(sql.includes("SET status='review'")){row.status='review';row.last_error=args[0];return [{affectedRows:1}];}
  throw new Error('Unexpected test query: '+sql);
 })};
 service=createSchoolWeekdayReminders({database:db,readContext:async()=>structuredClone(context),loadSettings:settings,loadParticipants:people,emailTransport:send,createCommunication:communication});
});
const input=(extra={})=>({agencyId:2,providerId:7,actorId:99,requestKey:'test-request-00000001',now,...extra});
it('queues one explicit reminder without sending from the request action',async()=>{
 expect(await service.enqueue(input())).toMatchObject({deduplicated:false,reminder:{status:'pending',mode:'reminder'}});
 expect(send).not.toHaveBeenCalled();expect(rows[0].requested_by_user_id).toBe(99);expect(db.commit).toHaveBeenCalledOnce();
});
it('deduplicates retries and repeated clicks and limits reminders to one per 24 hours',async()=>{
 await service.enqueue(input());expect((await service.enqueue(input())).deduplicated).toBe(true);
 await service.process({agencyId:2,now});expect((await service.enqueue(input({requestKey:'different-key-0002'}))).deduplicated).toBe(true);
 expect((await service.enqueue(input({requestKey:'different-key-0003',now:new Date(+now+86400001)}))).deduplicated).toBe(false);expect(rows).toHaveLength(2);
});
it('refuses a reminder for completed forms, disabled agencies, invalid keys, and inactive recipients',async()=>{
 context.needsResponse=false;context.days.forEach(d=>d.answered=true);await expect(service.enqueue(input())).rejects.toThrow('already accounted');
 settings.mockResolvedValueOnce([]);await expect(service.enqueue(input())).rejects.toThrow('not configured');
 people.mockResolvedValueOnce([]);await expect(service.enqueue(input())).rejects.toThrow('not found');
 await expect(service.enqueue(input({requestKey:'bad'}))).rejects.toThrow('request key');expect(rows).toHaveLength(0);
});
it('does not send another email while the initial invitation is unconfirmed',async()=>{
 invitation=false;await expect(service.enqueue(input())).rejects.toThrow('initial invitation');expect(send).not.toHaveBeenCalled();
});
it('allows a completed historical form to be re-confirmed without an initial invitation and retains its old answers',async()=>{
 context.needsResponse=false;context.days.forEach(d=>d.answered=true);invitation=false;
 await service.enqueue(input({mode:'reconfirm'}));
 const profile=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO provider_public_profiles'));
 expect(JSON.parse(profile[1][1]).schoolWeekdaysByAgency['2']).toEqual({requestedAt:now.toISOString(),requestedBy:99,reconfirmationRequestedAt:now.toISOString()});
 expect(db.execute.mock.calls.some(([sql])=>sql.includes("'not_sent','cancelled'"))).toBe(true);expect(context.reconfirmationPending).toBe(true);
 await service.process({agencyId:2,now});expect(send.mock.calls[0][0].subject).toContain('re-confirm');
});
it('sends a new reminder once, CC/reply to coordinator, using Notifications automation rather than the requesting human',async()=>{
 await service.enqueue(input());await service.process({agencyId:2,now});await service.process({agencyId:2,now});
 expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][0]).toMatchObject({senderIdentityId:6,to:'provider@example.invalid',cc:config.owner_email,replyToOverride:config.owner_email,source:'auto',generatedByUserId:null,templateType:'school_weekday_reminder',existingCommunicationId:91});
 expect(send.mock.calls[0][0].text).toContain('Save availability');expect(communication.mock.calls[0][0].metadata).toMatchObject({actorType:'automation',requestedByUserId:99});expect(rows[0].status).toBe('sent');
});
it('cancels a queued reminder if the provider finishes before delivery',async()=>{
 await service.enqueue(input());context.needsResponse=false;context.days.forEach(d=>d.answered=true);
 await service.process({agencyId:2,now});expect(send).not.toHaveBeenCalled();expect(rows[0].status).toBe('cancelled');
});
it('holds uncertain or approval-queued sends for review and never blindly retries them',async()=>{
 await service.enqueue(input());send.mockRejectedValueOnce(new Error('Uncertain transport outcome'));await service.process({agencyId:2,now});await service.process({agencyId:2,now});
 expect(rows[0].status).toBe('review');expect(send).toHaveBeenCalledTimes(1);
 expect((await service.enqueue(input({requestKey:'another-key-000003',now:new Date(+now+86400001)}))).deduplicated).toBe(true);
});
it('atomically claims the queue so two processors cannot send the same reminder twice',async()=>{
 await service.enqueue(input());let finish;send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const first=service.process({agencyId:2,now});while(!finish)await new Promise(resolve=>setTimeout(resolve,0));
 await service.process({agencyId:2,now});finish({id:'accepted'});await first;expect(send).toHaveBeenCalledTimes(1);
});
it('does not mistake a queued approval for a sent email',async()=>{
 await service.enqueue(input());send.mockResolvedValueOnce({queued:true,pendingApproval:true,reason:'requires_approval'});await service.process({agencyId:2,now});
 expect(rows[0].status).toBe('review');expect(rows[0].sent_at).toBeNull();
});
it('computes cooldown from UTC MySQL timestamps independently of the server timezone',()=>{
 const original=process.env.TZ;try{process.env.TZ='America/Denver';expect(schoolWeekdayReminderReceipt({id:1,mode:'reminder',status:'sent',requested_at:'2026-11-17 02:30:00.000'},new Date('2026-11-18T02:31:00Z'))).toMatchObject({nextAllowedAt:'2026-11-18T02:30:00.000Z',canSendAgain:true});}finally{process.env.TZ=original;}
});
