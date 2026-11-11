import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import { assertSessionCommentEmailRecipient, buildSessionCommentNotificationEmail, createSessionCommentNotificationWorker, sessionCommentNotificationPath } from '../secureSessionCommentNotifications.service.js';

function workerFixture() {
  const delivery={id:81,agency_id:450,recipient_user_id:1,comment_id:9,kind:'immediate',status:'pending',communication_id:null,transport_claimed_at:null};
  const current={id:1,role:'provider',email:'testing+provider@itsco.health',work_email:'testing+provider@itsco.health'};
  const a={id:101,client_id:10,agency_id:450};
  const databaseWrites=[];
  const db={execute:vi.fn(async(sql,p=[])=>{
    databaseWrites.push({sql,p});
    if(sql.startsWith("UPDATE secure_session_comment_deliveries SET status='sending'")){const ok=delivery.status==='pending';if(ok)delivery.status='sending';return [{affectedRows:ok?1:0}];}
    if(sql.startsWith('UPDATE secure_session_comment_deliveries SET status=?')){delivery.status=p[0];delivery.reason=p[1];delivery.communication_id=p.length>3?p[2]:delivery.communication_id;return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO notifications'))return [{insertId:17}];
    if(sql.startsWith('UPDATE secure_session_comment_deliveries SET notification_id')){delivery.notification_id=p[0];return [{affectedRows:1}];}
    if(sql.startsWith('SELECT *,DATE_FORMAT'))return [[{...delivery}]];
    if(sql.startsWith('UPDATE secure_session_comment_deliveries SET transport_claimed_at')){if(delivery.transport_claimed_at)return [{affectedRows:0}];delivery.transport_claimed_at=new Date();delivery.communication_id=p[0];return [{affectedRows:1}];}
    throw new Error('Unhandled worker SQL');
  })};
  const comments={deliveryAccess:vi.fn(async()=>({current,a})),audit:vi.fn()};
  const channel=vi.fn(async()=>true);const send=vi.fn(async()=>({id:'gmail-qa',communicationId:123}));
  const worker=createSessionCommentNotificationWorker({db,comments,channel,send,settings:async()=>({secureClientMessageEmailEnabled:true})});
  return {delivery,current,a,db,comments,channel,send,worker,databaseWrites};
}
describe('generic notifications and durable delivery claims',()=>{
  it('never emits comment text, names or session dates into email content; supplied branded image has real text fallback',()=>{
    const mail=buildSessionCommentNotificationEmail({url:'https://auricwell.com/my-schedule?secureSessionComments=today',morning:true,body:'SECRET_CHILD_TEXT',clientName:'SECRET_NAME',sessionDate:'SECRET_DATE'});
    expect(JSON.stringify(mail)).not.toContain('SECRET_');expect(mail.html).toContain('/auricwell/session-comments/secure-session-button.png');expect(mail.html).toContain('Open secure session comments in AuricWell');expect(mail.text).toContain('Sign in');
    expect(sessionCommentNotificationPath({kind:'immediate',appointment:{id:101,client_id:10}})).toContain('scheduleAppointmentId=101');
    expect(sessionCommentNotificationPath({kind:'immediate',appointment:{id:101,client_id:10},family:true,personal:true})).toMatch(/^my-portal\?/);
  });
  it('claims each recipient once and creates only a generic personal notification',async()=>{
    const f=workerFixture();expect(await f.worker.dispatchOne(f.delivery)).toMatchObject({status:'sent'});expect(await f.worker.dispatchOne(f.delivery)).toMatchObject({status:'already_claimed'});
    expect(f.send).toHaveBeenCalledTimes(1);expect(f.comments.deliveryAccess).toHaveBeenCalledTimes(2);
    const insert=f.databaseWrites.find(w=>w.sql.startsWith('INSERT INTO notifications'));expect(insert.p[0]).not.toContain('Person');expect(insert.p[0]).toContain('secure session comments waiting');
    expect(JSON.parse(insert.p.at(-1))).toMatchObject({secureSessionComments:true,appointmentId:101,clientId:10});
  });
  it('routes independent client notifications to their own portal and guardian notifications to the guardian portal',async()=>{
    const personal=workerFixture();personal.current.role='client';
    const worker=createSessionCommentNotificationWorker({db:personal.db,comments:personal.comments,channel:personal.channel,send:personal.send,settings:async()=>({secureClientMessageEmailEnabled:true}),personal:async()=>true});
    await worker.dispatchOne(personal.delivery);
    expect(JSON.parse(personal.databaseWrites.find(w=>w.sql.startsWith('INSERT INTO notifications')).p.at(-1)).actionUrl).toMatch(/^\/my-portal\?/);
    const guardian=workerFixture();guardian.current.role='client_guardian';
    const guardianWorker=createSessionCommentNotificationWorker({db:guardian.db,comments:guardian.comments,channel:guardian.channel,send:guardian.send,settings:async()=>({secureClientMessageEmailEnabled:true}),personal:async()=>false});
    await guardianWorker.dispatchOne(guardian.delivery);
    expect(JSON.parse(guardian.databaseWrites.find(w=>w.sql.startsWith('INSERT INTO notifications')).p.at(-1)).actionUrl).toMatch(/^\/guardian\?/);
  });
  it('checks revoked rights before any notification and never automatically retries an unknown transport',async()=>{
    const f=workerFixture();f.comments.deliveryAccess.mockRejectedValue(Object.assign(new Error('revoked'),{status:403}));
    expect(await f.worker.dispatchOne(f.delivery)).toMatchObject({status:'skipped'});expect(f.send).not.toHaveBeenCalled();expect(f.databaseWrites.some(w=>w.sql.startsWith('INSERT INTO notifications'))).toBe(false);
    const g=workerFixture();g.send.mockRejectedValue(new Error('uncertain transport'));
    expect(await g.worker.dispatchOne(g.delivery)).toMatchObject({status:'unknown'});expect(await g.worker.dispatchOne(g.delivery)).toMatchObject({status:'already_claimed'});expect(g.send).toHaveBeenCalledTimes(1);
  });
  it('respects notification email opt-out and queued outcomes, without reclassifying queueing as delivery',async()=>{
    const f=workerFixture();f.channel.mockImplementation(async({channel})=>channel!=='email');expect(await f.worker.dispatchOne(f.delivery)).toMatchObject({status:'skipped'});expect(f.send).not.toHaveBeenCalled();
    const g=workerFixture();g.send.mockResolvedValue({queued:true,pendingApproval:true,communicationId:123});expect(await g.worker.dispatchOne(g.delivery)).toMatchObject({status:'queued'});expect(g.delivery.communication_id).toBe(123);
  });
  it('a queued send must retain exact account/address/agency and current unread rights; transport can be attempted only once',async()=>{
    const f=workerFixture();f.delivery.status='queued';f.delivery.communication_id=123;
    const input={templateType:'secure_session_comment_notice:81',agencyId:450,userId:1,to:f.current.email,communicationId:123};
    const overrides={db:f.db,comments:f.comments,channel:f.channel};
    await assertSessionCommentEmailRecipient({...input,claim:true},overrides);
    await expect(assertSessionCommentEmailRecipient({...input,claim:true},overrides)).rejects.toMatchObject({status:409});
    await expect(assertSessionCommentEmailRecipient({...input,to:'someone@example.test'},overrides)).rejects.toMatchObject({status:403});
    await expect(assertSessionCommentEmailRecipient({...input,userId:2},overrides)).rejects.toMatchObject({status:409});
    await expect(assertSessionCommentEmailRecipient({...input,cc:'extra@example.test'},overrides)).rejects.toMatchObject({status:403});
    f.comments.deliveryAccess.mockRejectedValue(Object.assign(new Error('read or revoked'),{status:403}));
    await expect(assertSessionCommentEmailRecipient(input,overrides)).rejects.toMatchObject({status:403});
  });
});

function morningFixture({now='2026-11-11T14:00:00Z',zone='America/Denver',pages}={}){
 const candidate={id:1,role:'provider',timezone:zone,daily_digest_time:'12:00'};
 const writes=[],keys=new Set();let page=0;
 const db={execute:vi.fn(async(sql,p=[])=>{
  if(sql.startsWith('SELECT u.id'))return [pages?pages[page++]:[candidate]];
  if(sql.startsWith('INSERT IGNORE')){const key=p[2];writes.push({sql,p});const inserted=!keys.has(key);keys.add(key);return[{affectedRows:inserted?1:0}];}
  throw new Error('Unexpected morning SQL');
 })};
 const comments={today:vi.fn(async()=>({activeDay:true,unreadCount:1,dayKey:'2026-11-11',appointments:[{agencyId:450}]}))};
 const worker=createSessionCommentNotificationWorker({db,comments,clock:()=>new Date(now)});
 return{worker,comments,db,writes};
}
describe('07:00 schedule-local morning reminders',()=>{
 it('waits until07local regardless of an unrelated noon digest preference, and queues only one agency/person/day',async()=>{
  const before=morningFixture({now:'2026-11-11T13:59:00Z'});expect(await before.worker.queueMorning()).toBe(0);expect(before.comments.today).not.toHaveBeenCalled();
  const due=morningFixture();expect(await due.worker.queueMorning()).toBe(1);expect(await due.worker.queueMorning()).toBe(0);
  expect(due.comments.today).toHaveBeenCalledWith(expect.objectContaining({timeZone:'America/Denver',includeBodies:false,auditView:false}));
  expect(due.writes[0].p).toEqual([450,1,'morning:450:1:2026-11-11','America/Denver','2026-11-11']);
 });
 it('uses the canonical schedule zone when the profile is unset, including after daylight-saving changes',async()=>{
  // SQL COALESCE(up.timezone,u.timezone,unique source_timezone) supplies this field.
  const due=morningFixture({zone:'America/New_York',now:'2026-11-11T12:00:00Z'});expect(await due.worker.queueMorning()).toBe(1);
  const query=due.db.execute.mock.calls[0][0];expect(query).toContain("NULLIF(a.source_timezone,'')");expect(query).toContain('GROUP BY u.id');
  const summerBefore=morningFixture({zone:'America/New_York',now:'2026-07-01T10:59:00Z'});expect(await summerBefore.worker.queueMorning()).toBe(0);
  const summerDue=morningFixture({zone:'America/New_York',now:'2026-07-01T11:00:00Z'});expect(await summerDue.worker.queueMorning()).toBe(1);
 });
 it('does not starve recipients after the first250 and wraps the stable ID cursor',async()=>{
  const first=Array.from({length:250},(_,i)=>({id:i+1,role:'provider',timezone:'America/Denver'}));
  const f=morningFixture({pages:[first,[{id:251,role:'provider',timezone:'America/Denver'}],[]]});
  expect(await f.worker.queueMorning()).toBe(250);expect(await f.worker.queueMorning()).toBe(1);expect(await f.worker.queueMorning()).toBe(0);
  const reads=f.db.execute.mock.calls.filter(([sql])=>sql.startsWith('SELECT u.id'));expect(reads.map(([,p])=>p[0])).toEqual([0,250,0]);
 });
 it('does not queue after day end or when the unread set is empty',async()=>{
  for(const state of [{activeDay:false,unreadCount:1},{activeDay:true,unreadCount:0}]){const f=morningFixture();f.comments.today.mockResolvedValue({...state,appointments:[]});expect(await f.worker.queueMorning()).toBe(0);}
 });
});
