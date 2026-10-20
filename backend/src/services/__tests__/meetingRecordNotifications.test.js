import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
import {queueMeetingRecordNotice,processMeetingRecordNotices,correctionNoticeLines} from '../meetingRecordNotifications.service.js';
beforeEach(()=>vi.resetAllMocks());
it('queues a durable unique notice through the caller transaction',async()=>{
 m.execute.mockResolvedValue([{affectedRows:1}]);await queueMeetingRecordNotice(m,{type:'supervision',id:7,kind:'correction',sourceId:12,actorUserId:3});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE'),['supervision',7,'correction',12,3]);
});
it.each(['pending','failed'])('waits for attendance and payroll reconciliation: %s',async sync_status=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_record_notification_jobs')?[[{id:1,notice_kind:'correction',source_id:12,meeting_id:7,meeting_type:'supervision'}]]:sql.includes('FROM supervision_time_corrections')?[[{status:'approved',sync_status}]]:[[]]);
 const deliver=vi.fn();await processMeetingRecordNotices(deliver);expect(deliver).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('sends a correction only to the affected person and supervisors, with its own deduplication key',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_record_notification_jobs')?[[{id:1,notice_kind:'correction',source_id:12,meeting_id:7,meeting_type:'supervision',actor_user_id:3}]]:sql.includes('FROM supervision_time_corrections')?[[{status:'approved',sync_status:'complete',user_id:8,supervisor_user_id:3,co_facilitator_user_id:null,total_seconds:2700,reason:'Phone continuation',modality:'PHONE',start_at:'2026-10-15 18:00:00',end_at:'2026-10-15 18:45:00',previous_record_json:{total_seconds:98}}]]:[[]]);
 const deliver=vi.fn().mockResolvedValue(true);await processMeetingRecordNotices(deliver);
 expect(deliver).toHaveBeenCalledWith('supervision',7,expect.objectContaining({deliveryKey:'record-1',actorUserId:3,recordNotice:expect.objectContaining({userIds:[8,3]})}));
 const lines=deliver.mock.calls[0][2].recordNotice.lines.join(' ');expect(lines).toContain('1.63 minutes');expect(lines).toContain('45 minutes');expect(lines).toContain('Phone continuation');expect(lines).toContain('12:00 PM');
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SET completed_at'),[1]);
});
it('keeps a manual meeting notification pending until delivery is ready',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_record_notification_jobs')?[[{id:2,notice_kind:'manual',source_id:9,meeting_id:7,meeting_type:'team',actor_user_id:3}]]:sql.includes('FROM manual_meeting_logs')?[[{id:9,reason:'phone',platform:'PHONE'}]]:sql.includes('FROM manual_meeting_log_attendees')?[[{user_id:3},{user_id:8}]]:[[]]);
 const deliver=vi.fn().mockResolvedValue(false);await processMeetingRecordNotices(deliver);
 expect(deliver.mock.calls[0][2].recordNotice.userIds).toEqual([3,8]);expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
