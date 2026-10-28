import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { createCancellationSchoolRosterService } from '../cancellationSchoolRoster.service.js';
const row={assignment_id:1,client_id:8,school_id:4,service_day:'Wednesday',status:'ACTIVE',client_status_key:'being_seen',school_name:'Rudy',provider_name:'Nicole'};
const contact={key:'guardian:7',userId:7,role:'guardian',name:'Parent',email:'parent@example.test',phone:''};
const client={clientId:8,clientName:'Child',mode:'guardian',channels:['email'],contacts:[contact],recipients:[contact]};
const args={agencyId:2,providerId:505,date:'2026-10-28',reason:'Provider availability',followUpAction:'client_contact_support',required:true};
function setup(){
 const receipts=new Map(); let rows=[row];
 const database={execute:vi.fn(async(sql,a=[])=>{
   if(sql.includes('FROM client_provider_assignments'))return [rows];
   const key=JSON.stringify(a.slice(0,3));
   if(sql.startsWith('INSERT IGNORE')){if(!receipts.has(key))receipts.set(key,{status:'pending'});return [{}];}
   if(sql.includes("SET status='sending'")){const r=receipts.get(key);if(['pending','failed'].includes(r?.status)){r.status='sending';return [{affectedRows:1}];}return [{affectedRows:0}];}
   if(sql.includes('SET status=?')){receipts.set(JSON.stringify(a.slice(4)),{status:a[0],error_message:a[1],recipient_address:a[6]});return [{}];}
   if(sql.startsWith('SELECT status'))return [[receipts.get(key)]];
   throw Error(sql);
 })};
 const contacts=vi.fn(async()=>structuredClone(client)),permitted=vi.fn(async()=>true),sendEmail=vi.fn(async()=>({id:'sent',communicationId:21}));
 const service=createCancellationSchoolRosterService({database,contacts,permitted,sendEmail});
 return {service,database,contacts,permitted,sendEmail,setRows:r=>{rows=r;}};
}
describe('school roster cancellation without appointments',()=>{
 it('scopes to tenant, provider and exact assigned weekday; excludes inactive/waitlist/terminated and duplicates',async()=>{
  const s=setup();s.setRows([row,{...row},{...row,client_id:9,client_status_key:'terminated'},{...row,client_id:10,client_status_key:'waitlist'},{...row,client_id:11,status:'ARCHIVED'}]);
  expect(await s.service.list(args)).toEqual([row]);
  expect(s.database.execute.mock.calls[0][1]).toEqual([2,505,'Wednesday']);
  expect(s.database.execute.mock.calls[0][0]).toContain('cpa.is_active=1');
 });
 it('reviews an absence without claiming an appointment exists or sending',async()=>{
  const s=setup();const item=await s.service.review(row,args);
  expect(item.message.text).toContain('school sessions with this provider will not take place');
  expect(item.message.text).not.toContain('appointment scheduled');expect(s.sendEmail).not.toHaveBeenCalled();
  expect(item.clients[0].emailOnly).toBe(true);
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
