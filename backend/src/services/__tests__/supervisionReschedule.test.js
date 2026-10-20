import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),available:vi.fn(),review:vi.fn()}));
vi.mock('../recurringScheduleCancellation.service.js',()=>({withRecurringScheduleEdit:fn=>fn(m)}));
vi.mock('../appointmentConflict.service.js',()=>({assertAppointmentWindowAvailable:m.available}));
vi.mock('../supervisionReviewTime.service.js',()=>({assertNoReviewTimeOverlap:m.review}));
import {shiftedSupervisionWindow,rescheduleSupervisionOccurrences} from '../supervisionReschedule.service.js';
const anchor={id:1,agency_id:2,supervisor_user_id:7,supervisee_user_id:8,session_type:'group',status:'SCHEDULED',start_at:'2026-10-27 19:00:00',end_at:'2026-10-27 20:00:00',recurrence_series_id:'weekly'};
let rows;
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));rows=[anchor,{...anchor,id:2,start_at:'2026-11-03 20:00:00',end_at:'2026-11-03 21:00:00'},{...anchor,id:3,status:'CANCELLED',cancel_reason:'Holiday',start_at:'2026-11-24 20:00:00',end_at:'2026-11-24 21:00:00'}];m.execute.mockImplementation(async sql=>{if(sql.startsWith('SELECT *')&&sql.includes('WHERE id=?'))return [[anchor]];if(sql.startsWith('SELECT *'))return [rows];if(sql.includes('GET_LOCK'))return [[{acquired:1}]];if(sql.startsWith('SELECT session_id'))return [[{session_id:2,user_id:9}]];return [[]];});});
it('moves the weekday and wall clock through DST, including Date instances from mysql',()=>{
 const result=shiftedSupervisionWindow({...rows[1],start_at:new Date('2026-11-03T20:00:00Z')},anchor,'2026-10-29 21:00:00','2026-10-29 22:30:00','America/Denver');
 expect(result).toEqual({startAt:'2026-11-05 22:00:00',endAt:'2026-11-05 23:30:00'});
});
it('validates all required people before moving dates, preserves canceled dates and does not invite anyone',async()=>{
 const result=await rescheduleSupervisionOccurrences({id:1,startAt:'2026-10-29 21:00:00',endAt:'2026-10-29 22:00:00',timeZone:'America/Denver',scope:'future'});
 expect(result.updated[2]).toMatchObject({status:'CANCELLED',cancel_reason:'Holiday',start_at:'2026-11-26 22:00:00'});
 expect(m.available.mock.calls.map(c=>c[1].providerUserId)).toEqual([7,7,9]);
 expect(m.execute.mock.calls.some(([sql])=>/notifications|email_invitations/.test(sql))).toBe(false);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('recurrenceContinuationFrom'))).toBe(true);
 expect(m.commit).toHaveBeenCalledOnce();
});
it('rolls back the entire series if a later presenter has a conflict',async()=>{
 m.available.mockImplementation(async(_db,row)=>{if(row.providerUserId===9)throw new Error('Presenter has a client appointment');});
 await expect(rescheduleSupervisionOccurrences({id:1,startAt:'2026-10-29 21:00:00',endAt:'2026-10-29 22:00:00',timeZone:'America/Denver',scope:'future'})).rejects.toThrow('client appointment');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.filter(([sql])=>sql.includes('RELEASE_LOCK'))).toHaveLength(4);
});
it('keeps dates moved beyond the rolling year inactive until renewal can safely restore them',async()=>{
 rows.push({...anchor,id:4,start_at:'2027-10-12 19:00:00',end_at:'2027-10-12 20:00:00'});
 const result=await rescheduleSupervisionOccurrences({id:1,startAt:'2026-10-29 21:00:00',endAt:'2026-10-29 22:00:00',timeZone:'America/Denver',scope:'future'});
 expect(result.updated[3]).toMatchObject({start_at:'2027-10-14 21:00:00',status:'CANCELLED',recurrence_horizon_held:1});
 expect(m.available.mock.calls.some(([,input])=>input.startAt.startsWith('2027-10-14'))).toBe(false);
 const update=m.execute.mock.calls.find(([sql,args])=>sql.startsWith('UPDATE supervision_sessions SET start_at')&&args.at(-1)===4);
 expect(update[1].slice(-3)).toEqual(['CANCELLED',1,4]);
});

afterEach(()=>vi.useRealTimers());

it('moves only the selected individual occurrence while retaining its original series position',async()=>{
 anchor.session_type='individual';
 const result=await rescheduleSupervisionOccurrences({id:1,startAt:'2026-10-29 21:00:00',endAt:'2026-10-29 22:00:00',timeZone:'America/Denver',scope:'single'});
 expect(result.updated).toHaveLength(1);
 expect(result.updated[0]).toMatchObject({id:1,recurrence_series_id:'weekly',start_at:'2026-10-29 21:00:00'});
 const writes=m.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE supervision_sessions SET start_at'));
 expect(writes).toHaveLength(1);expect(writes[0][1].at(-1)).toBe(1);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('recurrenceOriginalStartAt'))).toBe(true);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('recurrenceContinuationFrom'))).toBe(false);
 expect(m.available.mock.calls.map(c=>c[1].providerUserId)).toEqual([7,8]);
});
