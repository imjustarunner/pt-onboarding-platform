import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn(async()=>'+17197163661')}));
vi.mock('../../models/User.model.js',()=>({default:{normalizePhone:value=>value}}));
import {createSchoolWeekdayFollowups} from '../schoolWeekdayFollowups.service.js';
import {schoolWeekdayCompletion,schoolWeekdayEmail,schoolWeekdaySmsDue,schoolWeekdayProgress} from '../../utils/schoolWeekdayFollowups.js';
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const now=new Date('2026-11-11T17:00:00Z');
const config={agency_id:2,owner_user_id:507,owner_email:'rachel@itsco.health',owner_name:'Rachel',sender_identity_id:6,from_email:'notifications@itsco.health',identity_key:'notifications',agency_name:'ITSCO',slug:'itsco',sms_delay_hours:24};
let context,rows,sendEmail,sendSms,createCommunication,service,held,readContext;
beforeEach(()=>{
 context={eligible:true,needsResponse:true,requestedAt:'2026-11-06T12:00:00Z',days:weekdays.map((day,i)=>({day,status:i===0?'assigned':'available',answered:false}))};
 rows=[];held=false;sendEmail=vi.fn(async()=>({id:'accepted'}));sendSms=vi.fn(async()=>({sid:'text-accepted'}));createCommunication=vi.fn(async()=>({id:500}));
 const person={id:7,first_name:'Avery',last_name:'Example',work_email:'avery@itsco.health',email:'avery@itsco.health',personal_phone:'+17195550101'};
 const database={getConnection:async()=>({release(){},execute:async sql=>{if(sql.includes('GET_LOCK')){if(held)return [[{acquired:0}]];held=true;return [[{acquired:1}]];}held=false;return [[{released:1}]];}}),execute:vi.fn(async(sql,args=[])=>{
  if(sql.includes('FROM school_weekday_followup_settings'))return [[config]];
  if(sql.includes('SELECT DISTINCT u.id'))return [[person]];
  if(sql.startsWith('SELECT id FROM school_weekday_followups'))return [[...rows.filter(r=>!r.completed_at&&!r.cancelled_at).slice(0,1)]];
  if(sql.startsWith('INSERT IGNORE INTO school_weekday_followups')){if(!rows.some(r=>r.request_key===args[2]))rows.push({id:1,agency_id:2,provider_id:7,request_key:args[2],invitation_status:'pending',sms_status:'waiting',thankyou_status:'waiting'});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM school_weekday_followups'))return [[...rows.filter(r=>!r.cancelled_at&&(!r.completed_at||r.thankyou_status==='waiting')).map(r=>({...r}))]];
  const row=rows.find(r=>r.id===args.at(-1)||r.id===args[0]);if(!row)throw new Error('Missing test row');
  for(const column of ['invitation','thankyou']){
   if(sql.includes(`SET ${column}_status='sending'`)){if(row[column+'_status']!==args[1])return [{affectedRows:0}];row[column+'_status']='sending';return [{affectedRows:1}];}
   if(sql.includes(`SET ${column}_communication_id`)){row[column+'_communication_id']=args[0];return [{affectedRows:1}];}
   if(sql.includes(`SET ${column}_status=?`)){row[column+'_status']=args[0];row[column+'_sent_at']=args[1];if(column==='invitation')row.sms_due_at=args[3];return [{affectedRows:1}];}
   if(sql.includes(`SET ${column}_status='review'`)){row[column+'_status']='review';return [{affectedRows:1}];}
  }
  if(sql.includes("SET invitation_status='cancelled'"))row.invitation_status='cancelled';
  else if(sql.includes('SET completed_at=')){row.completed_at=args[0];if(['waiting','sending'].includes(row.sms_status))row.sms_status='cancelled';if(row.invitation_status==='pending')row.invitation_status='cancelled';}
  else if(sql.includes('SET cancelled_at=')){row.cancelled_at=args[0];row.sms_status='cancelled';}
  else if(sql.includes('SET opened_at='))row.opened_at=args[0];
  else if(sql.includes("SET sms_status='sending'")){if(row.sms_status!=='waiting'||row.completed_at)return [{affectedRows:0}];row.sms_status='sending';}
  else if(sql.includes("SET sms_status='sent'")){row.sms_status='sent';row.sms_message_id=args[0];}
  else if(sql.includes("SET sms_status='cancelled'"))row.sms_status='cancelled';
  else if(sql.includes('SET sms_status=?'))row.sms_status=args[0];
  else throw new Error('Unexpected test query');return [{affectedRows:1}];
 })};
 readContext=vi.fn(async()=>structuredClone(context));
 service=createSchoolWeekdayFollowups({database,readContext,emailTransport:sendEmail,smsTransport:sendSms,createCommunication});
});
describe('school weekday follow-ups',()=>{
 it('counts assignments and explicit true/false answers, never unsaved green defaults',()=>{
  expect(schoolWeekdayCompletion(context)).toEqual({accounted:1,complete:false});
  context.days.forEach(day=>day.answered=true);expect(schoolWeekdayCompletion(context).complete).toBe(true);
  expect(schoolWeekdayCompletion({...context,eligible:false}).complete).toBe(false);
  expect(schoolWeekdayProgress({...context,openedAt:'2026-11-11T10:00:00Z'}).status).toBe('completed');
 });
 it('sends one invitation per outstanding form, with Rachel CC/reply-to and the Notifications signature path',async()=>{
  await service.process({now});await service.process({now});
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,to:'avery@itsco.health',cc:'rachel@itsco.health',replyToOverride:'rachel@itsco.health',source:'auto',templateType:'school_weekday_invitation',existingCommunicationId:500,preloggedReceipt:true}));
  const mail=sendEmail.mock.calls[0][0];expect(mail.text).toContain('Save availability');expect(mail.linkUrl).toBe('https://app.itsco.health/my-schedule?schoolAvailability=1&agencyId=2');
  expect(new Date(rows[0].sms_due_at.replace(' ','T')+'Z').getTime()-now.getTime()).toBe(86400000);
 });
 it('holds ambiguous email failures for review and never blindly sends again',async()=>{
  sendEmail.mockRejectedValueOnce(new Error('Transport outcome unknown'));await service.process({now});await service.process({now});
  expect(sendEmail).toHaveBeenCalledTimes(1);expect(rows[0].invitation_status).toBe('review');expect(sendSms).not.toHaveBeenCalled();
 });
 it('sends a short thank-you once after all five days are accounted for, stopping the pending text',async()=>{
  await service.process({now});context.needsResponse=false;context.days.forEach(day=>day.answered=true);context.completedAt='2026-11-11T17:05:00Z';
  await service.process({now:new Date('2026-11-11T17:06:00Z')});await service.process({now:new Date('2026-11-12T17:10:00Z')});
  expect(sendEmail).toHaveBeenCalledTimes(2);expect(sendEmail.mock.calls[1][0]).toMatchObject({templateType:'school_weekday_thankyou',cc:config.owner_email,replyToOverride:config.owner_email});
  expect(sendEmail.mock.calls[1][0].text.length).toBeLessThan(180);expect(sendSms).not.toHaveBeenCalled();expect(rows[0].sms_status).toBe('cancelled');
 });
 it('never sends invitations or thank-yous to already completed historical requests',async()=>{
  context.needsResponse=false;context.days.forEach(day=>day.answered=true);await service.process({now});expect(sendEmail).not.toHaveBeenCalled();expect(rows).toHaveLength(0);
 });
 it('suppresses a due reminder when the provider completes between row loading and sending',async()=>{
  await service.process({now});
  const completed={...context,needsResponse:false,days:context.days.map(day=>({...day,answered:true}))};
  readContext.mockResolvedValueOnce(structuredClone(context)).mockResolvedValueOnce(structuredClone(context)).mockResolvedValueOnce(completed);
  const result=await service.process({now:new Date('2026-11-12T17:10:00Z')});
  expect(result.results).toContainEqual({id:1,kind:'sms',status:'cancelled'});expect(sendSms).not.toHaveBeenCalled();
 });
 it('sends only one daytime reminder after 24h and records consent suppression without retrying',async()=>{
  await service.process({now});await service.process({now:new Date('2026-11-12T16:59:00Z')});expect(sendSms).not.toHaveBeenCalled();
  sendSms.mockRejectedValueOnce(Object.assign(new Error('Not enrolled'),{code:'sms_consent_required',status:403}));
  await service.process({now:new Date('2026-11-12T17:10:00Z')});await service.process({now:new Date('2026-11-13T17:10:00Z')});
  expect(sendSms).toHaveBeenCalledTimes(1);expect(rows[0].sms_status).toBe('suppressed');
 });
 it('uses a cross-process lease so a second worker cannot duplicate an in-flight email',async()=>{
  let release;sendEmail.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const first=service.process({now});while(!release)await new Promise(resolve=>setTimeout(resolve,0));
  expect(await service.process({now})).toMatchObject({busy:true});release({id:'accepted'});await first;expect(sendEmail).toHaveBeenCalledTimes(1);
 });
 it('supports a read-only recipient preview without queuing jobs or sending',async()=>{
  expect((await service.process({now,dryRun:true})).results).toEqual([{providerId:7,agencyId:2,to:'avery@itsco.health',cc:'rachel@itsco.health'}]);
  expect(rows).toHaveLength(0);expect(sendEmail).not.toHaveBeenCalled();
 });
 it('defers texts on nights and weekends and preserves previously sent text history after completion',()=>{
  const row={invitation_status:'sent',sms_status:'waiting',sms_due_at:'2026-11-11T10:00:00Z'};
  expect(schoolWeekdaySmsDue(row,new Date('2026-11-12T03:00:00Z'))).toBe(false);
  expect(schoolWeekdaySmsDue(row,new Date('2026-11-14T17:00:00Z'))).toBe(false);
  expect(schoolWeekdaySmsDue(row,new Date('2026-11-12T17:00:00Z'))).toBe(true);
  context.days.forEach(day=>day.answered=true);expect(schoolWeekdayProgress(context,{sms_status:'sent'}).smsStatus).toBe('sent');
 });
});
