import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { createManualSessionReminders } from '../manualSessionReminder.service.js';
const now=new Date('2026-11-13T20:00:00Z');
const appointment={id:12,agencyId:2,status:'scheduled',startAt:'2026-11-15 18:00:00'};
let rows,db,conn,build,service;
beforeEach(()=>{
  rows=[];
  conn={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[rows]:[{insertId:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  db={execute:conn.execute,getConnection:vi.fn(async()=>conn)};
  build=vi.fn(async()=>({appointment,clientId:9,deliveries:[{kind:'standard_reminder',channel:'email',recipientGuardianUserId:5},{kind:'additional_reminder',channel:'email',recipientGuardianUserId:5},{kind:'standard_reminder',channel:'sms',recipientGuardianUserId:5}]}));
  service=createManualSessionReminders({db,clock:()=>now,lock:async(id,work)=>work()});
});
it('queues one extra delivery per permitted channel without rebuilding the existing schedule',async()=>{
  expect(await service.queue(appointment,build,7)).toMatchObject({queued:2,additionalReminderAvailableAt:'2026-11-14T20:00:00.000Z'});
  const inserts=conn.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO appointment_reminders'));
  expect(inserts).toHaveLength(2);
  expect(inserts[0][1]).toEqual([12,2,'email','additional_reminder','manual_extra','client',0,null,0,null,0,'2026-11-13 20:00:01',5,9,null]);
  expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE')||sql.startsWith('DELETE'))).toBe(false);
  expect(conn.commit).toHaveBeenCalled();
});
it.each(['sent','pending'])('enforces the cooldown across callers when the prior reminder is %s',async status=>{
  rows=[{id:1,rule_key:'manual_extra',status,created_at:'2026-11-13 19:00:00'}];
  await expect(service.queue(appointment,build,8)).rejects.toMatchObject({status:409,availableAt:'2026-11-14T19:00:00.000Z'});
  expect(build).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalled();
});
it('allows a later reminder after 24 hours and ignores ordinary automated reminders for this limit',async()=>{
  rows=[{rule_key:'manual_extra',status:'sent',created_at:'2026-11-12 20:00:00'},{rule_key:'standard',status:'sent',created_at:'2026-11-13 19:00:00'}];
  expect((await service.state(appointment)).canSendAdditionalReminder).toBe(true);
  await service.queue(appointment,build,7);expect(conn.commit).toHaveBeenCalled();
});
it.each([{...appointment,status:'canceled_by_provider'},{...appointment,startAt:'2026-11-12 18:00:00'}])('rejects reminders for a canceled or past session',async appt=>{
  await expect(service.queue(appt,build,7)).rejects.toMatchObject({status:409});expect(build).not.toHaveBeenCalled();
});
it('does not enqueue a reminder when every delivery channel is unavailable',async()=>{
  build.mockResolvedValue({appointment,deliveries:[]});
  await expect(service.queue(appointment,build,7)).rejects.toMatchObject({status:409});
  expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('returns actual sent and queued history to Notifications',async()=>{
  rows=[{id:5,kind:'standard_reminder',channel:'email',status:'sent',scheduled_for:'2026-11-13 18:00:00',sent_at:'2026-11-13 18:00:01',recipient_guardian_user_id:9}];
  expect((await service.state(appointment)).items[0]).toMatchObject({id:5,kind:'standard_reminder',status:'sent',sentAt:'2026-11-13T18:00:01.000Z',recipientUserId:9});
});
it('does not let canceled manual rows bypass the 24-hour cooldown',async()=>{
 rows=[{rule_key:'manual_extra',status:'canceled',created_at:'2026-11-13 19:00:00'}];expect((await service.state(appointment)).canSendAdditionalReminder).toBe(false);
});
it('serializes two simultaneous extra reminder requests and queues only one batch',async()=>{
 let tail=Promise.resolve();const lock=async(id,work)=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};
 conn.execute.mockImplementation(async(sql,params)=>{if(sql.startsWith('SELECT'))return[rows];if(sql.includes('INSERT INTO appointment_reminders'))rows.push({id:rows.length+1,rule_key:'manual_extra',status:'pending',created_at:'2026-11-13 20:00:00'});return[{insertId:1}];});
 const concurrent=createManualSessionReminders({db,clock:()=>now,lock});const results=await Promise.allSettled([concurrent.queue(appointment,build,7),concurrent.queue(appointment,build,8)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason.status).toBe(409);expect(build).toHaveBeenCalledTimes(1);
});
