import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../companyEventSms.service.js',()=>({sendCompanyEventSms:vi.fn()}));
import {processChildcareReminders} from '../childcareReminder.service.js';
const row={shift_id:8,event_id:80,agency_id:453,slug:'nlu-qa-demo',user_id:7,planned_children:3,phone_number:'+13035550100',email:'qa.childcare@example.com',title:'Childcare',starts_at:'2026-11-19T23:00:00Z',ends_at:'2026-11-20T02:00:00Z',timezone:'America/Denver',clock_in_count:0,last_punch:null};
describe('real childcare reminder worker',()=>{
 it('sends minimal planned count with a protected scoped app link once per channel',async()=>{
  const receipts=new Set(),db={execute:vi.fn(async(sql,p)=>{
   if(sql.startsWith('SELECT s.id shift_id'))return [[row]];
   if(sql.startsWith('INSERT IGNORE')){const key=p.join('|');if(receipts.has(key))return [{affectedRows:0}];receipts.add(key);return [{affectedRows:1,insertId:receipts.size}];}
   if(sql.startsWith('SELECT g.user_id'))return [[{user_id:7}]];
   if(sql.startsWith('UPDATE childcare_reminder_deliveries'))return [{affectedRows:1}];
   throw new Error(sql);
  })},sendSms=vi.fn(async()=>({sid:'sms-1'})),sendEmail=vi.fn(async()=>({id:'mail-1'}));
  const input={db,now:new Date('2026-11-19T23:00:00Z'),sendSms,sendEmail,baseUrl:'https://app.itsco.health'};
  expect(await processChildcareReminders(input)).toHaveLength(2);expect(await processChildcareReminders(input)).toHaveLength(0);
  expect(sendSms).toHaveBeenCalledTimes(1);expect(sendSms.mock.calls[0][0]).toMatchObject({agencyId:453,userId:7,purpose:'workforce',audience:'staff'});
  expect(sendSms.mock.calls[0][0].body).toContain('3 children were scheduled');expect(sendSms.mock.calls[0][0].body).toContain('/nlu-qa-demo/childcare?shiftId=8');expect(sendSms.mock.calls[0][0].body).not.toContain('CHECKIN');
 });
 it('suppresses old start reminders after a completed punch, and rechecks revoked access',async()=>{
  const sendSms=vi.fn(),sendEmail=vi.fn();let complete=true;
  const db={execute:vi.fn(async(sql)=>{
   if(sql.startsWith('SELECT s.id shift_id'))return [[{...row,clock_in_count:complete?1:0,last_punch:complete?'clock_out':null}]];
   if(sql.startsWith('INSERT IGNORE'))return [{affectedRows:1,insertId:1}];
   if(sql.startsWith('SELECT g.user_id'))return [[]];
   if(sql.startsWith('UPDATE'))return [{affectedRows:1}];throw new Error(sql);
  })};
  const input={db,now:new Date('2026-11-19T23:00:00Z'),sendSms,sendEmail,baseUrl:'https://app.itsco.health'};
  expect(await processChildcareReminders(input)).toEqual([]);complete=false;
  expect((await processChildcareReminders(input)).every(result=>result.status==='skipped')).toBe(true);
  expect(sendSms).not.toHaveBeenCalled();expect(sendEmail).not.toHaveBeenCalled();
 });
 it('becomes due at scheduled start and end, with no early clock or text',async()=>{
  let current={...row};const sendSms=vi.fn(async()=>({sid:'test'})),sendEmail=vi.fn(async()=>({id:'mail'}));
  const db={execute:vi.fn(async sql=>{
   if(sql.startsWith('SELECT s.id shift_id'))return [[current]];
   if(sql.startsWith('INSERT IGNORE'))return [{affectedRows:1,insertId:1}];
   if(sql.startsWith('SELECT g.user_id'))return [[{user_id:7}]];
   if(sql.startsWith('UPDATE'))return [{affectedRows:1}];throw new Error(sql);
  })};
  const input={db,sendSms,sendEmail,baseUrl:'https://app.itsco.health'};
  expect(await processChildcareReminders({...input,now:new Date('2026-11-19T22:59:59Z')})).toEqual([]);
  expect((await processChildcareReminders({...input,now:new Date('2026-11-19T23:00:00Z')}))[0].reminderType).toBe('clock_in');
  current={...row,last_punch:'clock_in',clock_in_count:1};
  expect(await processChildcareReminders({...input,now:new Date('2026-11-20T01:59:59Z')})).toEqual([]);
  expect((await processChildcareReminders({...input,now:new Date('2026-11-20T02:00:00Z')}))[0].reminderType).toBe('clock_out');
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO skill_builders_event_kiosk_punches'))).toBe(false);
 });
 it('allows the new due reminder after a real reschedule, and withholds a stale worker scan',async()=>{
  let current={...row,schedule_version:1},stale=false;const claims=new Set(),sendSms=vi.fn(async()=>({sid:'transport'})),sendEmail=vi.fn(async()=>({id:'mail'}));
  const db={execute:vi.fn(async(sql,p)=>{
   if(sql.startsWith('SELECT s.id shift_id'))return [[current]];
   if(sql.startsWith('INSERT IGNORE')){const key=p.join('|');if(claims.has(key))return [{affectedRows:0}];claims.add(key);return [{affectedRows:1,insertId:claims.size}];}
   if(sql.startsWith('SELECT g.user_id')){expect(sql).toContain('s.schedule_version=?');expect(sql).toContain('e.starts_at=?');expect(sql).toContain('s.planned_children=?');return [stale?[]:[{user_id:7}]];}
   if(sql.startsWith('UPDATE'))return [{affectedRows:1}];throw new Error(sql);
  })};
  const input={db,sendSms,sendEmail,baseUrl:'https://app.itsco.health'};
  await processChildcareReminders({...input,now:new Date('2026-11-19T23:00:00Z')});
  current={...current,schedule_version:2,starts_at:'2026-11-20T00:00:00Z',ends_at:'2026-11-20T03:00:00Z'};
  expect(await processChildcareReminders({...input,now:new Date('2026-11-19T23:30:00Z')})).toEqual([]);
  await processChildcareReminders({...input,now:new Date('2026-11-20T00:00:00Z')});expect(sendSms).toHaveBeenCalledTimes(2);expect(sendSms.mock.calls[1][0].batchId).toContain(':v2');
  stale=true;current={...current,schedule_version:3,planned_children:4};
  const result=await processChildcareReminders({...input,now:new Date('2026-11-20T00:00:00Z')});
  expect(result.every(r=>r.status==='skipped')).toBe(true);expect(sendSms).toHaveBeenCalledTimes(2);
 });
});
