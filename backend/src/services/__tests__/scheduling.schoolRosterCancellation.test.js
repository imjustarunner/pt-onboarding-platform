import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { createCancellationSchoolRosterService } from '../cancellationSchoolRoster.service.js';
const row={slots:[],assignment_id:1,client_id:8,school_id:4,service_day:'Wednesday',status:'ACTIVE',client_status_key:'being_seen',school_name:'Rudy',provider_name:'Nicole'};
const contact={key:'guardian:7',userId:7,role:'guardian',name:'Parent',email:'parent@example.test',phone:''};
const client={clientId:8,clientName:'Child',mode:'guardian',channels:['email'],contacts:[contact],recipients:[contact]};
const args={providerAuthored:true,agencyId:2,providerId:505,date:'2026-10-28',reason:'Provider availability',followUpAction:'client_contact_support',required:true};
function setup(){
 const receipts=new Map(); let rows=[row];
 const database={execute:vi.fn(async(sql,a=[])=>{
   if(sql.includes('FROM client_provider_assignments'))return [rows];
   const key=JSON.stringify(a.slice(0,3));
   if(sql.startsWith('INSERT IGNORE')){if(!receipts.has(key))receipts.set(key,{status:'pending'});return [{}];}
   if(sql.includes("SET status='sending'")){const r=receipts.get(key);if(['pending','failed'].includes(r?.status)){r.status='sending';return [{affectedRows:1}];}return [{affectedRows:0}];}
   if(sql.includes('SET status=?')){receipts.set(JSON.stringify(a.slice(4)),{status:a[0],error_message:a[1],recipient_address:a[6]});return [{}];}
   if(sql.includes('SET external_message_id=')) { Object.assign(receipts.get(JSON.stringify(a.slice(2))), {external_message_id:a[0],actual_recipient_address:a[1]});return [{}];}
   if(sql.startsWith('SELECT status'))return [[receipts.get(key)]];
   throw Error(sql);
 })};
 const contacts=vi.fn(async()=>structuredClone(client)),permitted=vi.fn(async()=>true),sendEmail=vi.fn(async()=>({id:'sent',communicationId:21}));
 const history={begin:vi.fn(async()=>1),finish:vi.fn()};
 const service=createCancellationSchoolRosterService({database,contacts,permitted,sendEmail,history,receipts:{issue:vi.fn(async()=>({id:1,url:'https://example.test/receipt'})),sent:vi.fn()}});
 return {service,database,contacts,permitted,sendEmail,history,setRows:r=>{rows=r;}};
}
describe('school roster cancellation without appointments',()=>{
 it('records missing email as an actionable unsent result while preserving the cancellation',async()=>{
  const s=setup();s.contacts.mockResolvedValue({...client,contacts:[{...contact,email:''}],recipients:[{...contact,email:''}]});
  const item=await s.service.review(row,args);const result=await s.service.send('review',item,505);
  expect(result).toMatchObject({sent:0,skipped:1});expect(result.deliveries[0].error_message).toContain('authorized contact has no email');
  expect(s.history.begin).toHaveBeenCalledBefore(s.history.finish);expect(s.sendEmail).not.toHaveBeenCalled();
 });
 it('records a deferred cancellation without sending and later preserves the reviewed recipient names',async()=>{
  const s=setup();const item=await s.service.review(row,args);
  expect(await s.service.send('review',item,505,{suppressed:true})).toMatchObject({sent:0,suppressed:1});
  expect(s.history.finish).toHaveBeenCalled();expect(s.sendEmail).not.toHaveBeenCalled();
  const result=await s.service.send('review',item,505);expect(result.deliveries[0]).toMatchObject({recipient_name:'Parent',channel:'email'});
 });
 it('scopes to tenant, provider and exact assigned weekday; excludes inactive/waitlist/terminated and duplicates',async()=>{
  const s=setup();s.setRows([row,{...row},{...row,client_id:9,client_status_key:'terminated'},{...row,client_id:10,client_status_key:'waitlist'},{...row,client_id:11,status:'ARCHIVED'}]);
  expect(await s.service.list(args)).toEqual([row]);
  expect(s.database.execute.mock.calls[0][1]).toEqual([2,505,'Wednesday']);
  expect(s.database.execute.mock.calls[0][0]).toContain('cpa.is_active=1');
 });
 it('reviews an absence without claiming an appointment exists or sending',async()=>{
  const s=setup();const item=await s.service.review(row,args);
  expect(item.message.text).toContain('at Rudy');expect(item.message.text).toContain('I need to cancel');
  expect(item.message.text).not.toContain('appointment scheduled');expect(s.sendEmail).not.toHaveBeenCalled();
  expect(item.clients[0].emailOnly).toBe(true);
 });
 it('includes saved minute-accurate school slots in the reviewed body and sends that exact body',async()=>{
  const s=setup();
  s.setRows([{...row,slot_id:3,start_time:'10:28:00',end_time:'11:21:00'}]);
  const [timed]=await s.service.list(args);
  const item=await s.service.review(timed,{...args,timeZone:'America/Denver'});
  expect(item.message.text).toContain('Wednesday, October 28, 2026 at 10:28 AM–11:21 AM (MDT)');
  expect(item.source.assignment).toEqual(timed);
  await s.service.send('review',item,505);
  expect(s.sendEmail.mock.calls[0][0].text).toContain(item.message.text);
 });
 it('lists all saved ranges for a full day but only overlapping ranges for a timed Planned Out',async()=>{
  const s=setup(), timed={...row,slots:[{id:3,startTime:'10:28:00',endTime:'11:21:00'},{id:4,startTime:'14:00:00',endTime:'14:45:00'}]};
  const whole=await s.service.review(timed,{...args,timeZone:'America/Denver'});
  expect(whole.message.text).toContain('10:28 AM–11:21 AM and 2:00 PM–2:45 PM (MDT)');
  const partial=await s.service.review(timed,{...args,timeZone:'America/Denver',urgent:false,windowStart:'2026-10-28T08:00:00-06:00',windowEnd:'2026-10-28T12:00:00-06:00'});
  expect(partial.message.text).toContain('10:28 AM–11:21 AM (MDT)');
  expect(partial.message.text).not.toContain('2:00 PM');
  expect(partial.source.assignment.slots).toHaveLength(2);
 });
 it('keeps untimed clients date-only and preserves an explicitly reviewed historical body',async()=>{
  const s=setup();
  const item=await s.service.review(row,{...args,timeZone:'America/Denver'});
  expect(item.message.text).toContain('Wednesday, October 28, 2026');
  expect(item.message.text).not.toMatch(/AM|PM|12:00/);
  const message={subject:'Saved original subject',text:'Saved original body'};
  expect((await s.service.review({...row,slots:[{startTime:'10:00:00',endTime:'11:00:00'}]},{...args,message,timeZone:'America/Denver'})).message).toEqual(message);
 });
 it('sends once across retries AND separate review tokens',async()=>{
  const s=setup();const item=await s.service.review(row,args);
  expect((await s.service.send('review-one',item,505)).sent).toBe(1);
  expect((await s.service.send('review-two',item,505)).sent).toBe(1);
  expect(s.sendEmail).toHaveBeenCalledTimes(1);
  expect(s.sendEmail).toHaveBeenCalledWith(expect.objectContaining({clientId:8,to:contact.email,agencyId:2}));
 });
 it('rechecks family permissions and records held rather than claiming delivery',async()=>{
  const s=setup();const item=await s.service.review(row,args);s.permitted.mockResolvedValue(false);
  expect(await s.service.send('review',item,505)).toMatchObject({sent:0,held:1});expect(s.sendEmail).not.toHaveBeenCalled();
 });
 it('rejects changed assignments or contacts before transport',async()=>{
  const s=setup();const item=await s.service.review(row,args);s.setRows([]);
  await expect(s.service.send('review',item,505)).rejects.toThrow('assignment changed');
  s.setRows([row]);s.contacts.mockResolvedValue({...client,contacts:[]});
  await expect(s.service.send('review',item,505)).rejects.toThrow('contacts changed');expect(s.sendEmail).not.toHaveBeenCalled();
 });
 it('preserves uncertain sends as held and does not blindly retry',async()=>{
  const s=setup();const item=await s.service.review(row,args);s.sendEmail.mockRejectedValue(new Error('network interrupted'));
  expect((await s.service.send('a',item,505)).held).toBe(1);await s.service.send('b',item,505);expect(s.sendEmail).toHaveBeenCalledTimes(1);
 });
 it('does not allow appointment-specific SMS or replacement offers for roster notices',async()=>{
  const s=setup();await expect(s.service.review(row,{...args,followUpAction:'private_slots'})).rejects.toThrow('scheduled appointments');
  s.contacts.mockResolvedValue({...client,channels:['sms']});await expect(s.service.review(row,args)).rejects.toThrow('support email');
 });
});

it('keeps separate assignments for two providers in a bulk read and sends nothing',async()=>{
 const s=setup();s.setRows([{...row,provider_id:505},{...row,provider_id:506}]);
 const rows=await s.service.readMany({...args,providerIds:[505,506]});expect(rows).toHaveLength(2);
 expect(s.database.execute.mock.calls[0][1]).toEqual([2,505,506,'Wednesday']);expect(s.database.execute.mock.calls[0][0]).toContain('cpa.provider_user_id IN (?,?)');
 expect(s.sendEmail).not.toHaveBeenCalled();expect(s.history.begin).not.toHaveBeenCalled();
 const before=s.database.execute.mock.calls.length;expect(await s.service.readMany({...args,providerIds:[]})).toEqual([]);expect(s.database.execute).toHaveBeenCalledTimes(before);
});
