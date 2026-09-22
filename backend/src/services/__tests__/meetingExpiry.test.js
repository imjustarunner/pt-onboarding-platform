import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {expireEmptyMeeting,pastMeetingDay} from '../meetingExpiry.service.js';
const now=new Date('2026-09-22T06:01:00Z');
const row={id:7,agency_id:2,end_at:'2026-09-22 05:59:00',agency_timezone:'America/Denver'};
describe('expired empty meeting rooms',()=>{
 it('uses the agency local day, including midnight and daylight saving changes',()=>{
  expect(pastMeetingDay(row.end_at,'America/Denver',now)).toBe(true);
  expect(pastMeetingDay('2026-09-22 06:00:00','America/Denver',now)).toBe(false);
  expect(pastMeetingDay(row.end_at,'America/Los_Angeles',now)).toBe(false);
  expect(pastMeetingDay('2026-11-02 06:59:00','America/Denver',new Date('2026-11-02T07:01:00Z'))).toBe(true);
  expect(pastMeetingDay('bad','America/Denver',now)).toBe(false);
 });
 it('closes yesterday’s empty room without finalizing attendance or payroll',async()=>{
  const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])};
  expect((await expireEmptyMeeting('team',row,db,now)).meeting_completed_at).toBe(row.end_at);
  const [sql,args]=db.execute.mock.calls[0];expect(args).toEqual([7]);
  expect(sql).toContain('NOT EXISTS');expect(sql).toContain('last_seen_at>=DATE_SUB');expect(sql).toContain('live.left_at IS NULL');expect(sql).not.toContain('status=');
 });
 it('keeps live rooms open and returns closure by a competing worker',async()=>{
  const db={execute:vi.fn().mockResolvedValueOnce([{affectedRows:0}]).mockResolvedValueOnce([[{live_ended_at:null}]])};
  expect((await expireEmptyMeeting('supervision',row,db,now)).live_ended_at).toBeNull();
  db.execute.mockResolvedValueOnce([{affectedRows:0}]).mockResolvedValueOnce([[{live_ended_at:row.end_at}]]);
  expect((await expireEmptyMeeting('supervision',row,db,now)).live_ended_at).toBe(row.end_at);
 });
 it('does not end a same-day or previously completed room',async()=>{
  const db={execute:vi.fn()};
  await expireEmptyMeeting('team',{...row,end_at:'2026-09-22 06:00:00'},db,now);
  await expireEmptyMeeting('team',{...row,meeting_completed_at:row.end_at},db,now);
  expect(db.execute).not.toHaveBeenCalled();
 });
});
