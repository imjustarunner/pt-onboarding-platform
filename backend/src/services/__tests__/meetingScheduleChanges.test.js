import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn()}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
import {meetingChangeSnapshot,hasMeetingChange,queueMeetingChange,meetingChangeDeliveryHash} from '../meetingScheduleChanges.service.js';
const event={id:3,title:'Leadership',provider_id:2,start_at:'2099-09-22 18:30:00',end_at:'2099-09-22 19:30:00'};
beforeEach(()=>{vi.clearAllMocks();db.execute.mockResolvedValue([[]]);});
describe('meeting change delivery',()=>{
 it('ignores type, notes and invitee ordering changes',()=>{const before=meetingChangeSnapshot(event,[4,3]);expect(hasMeetingChange(before,meetingChangeSnapshot({...event,meeting_subtype:'admin',description:'private notes'},[3,4,4]))).toBe(false);});
 it('compares database JSON regardless of MySQL object key order',()=>{expect(hasMeetingChange({title:'A',start:'B'},{start:'B',title:'A'})).toBe(false);});
 it('deduplicates the same series move across occurrence dates',()=>{
  const before=meetingChangeSnapshot(event,[3]),after={...before,start:'2099-09-22T19:30:00.000Z',end:'2099-09-22T20:30:00.000Z'};
  const nextBefore={...before,start:'2099-09-29T18:30:00.000Z',end:'2099-09-29T19:30:00.000Z'},nextAfter={...after,start:'2099-09-29T19:30:00.000Z',end:'2099-09-29T20:30:00.000Z'};
  expect(meetingChangeDeliveryHash({recurrence_series_id:'weekly'},before,after)).toBe(meetingChangeDeliveryHash({recurrence_series_id:'weekly'},nextBefore,nextAfter));
 });
 it('detects time and roster changes',()=>{const before=meetingChangeSnapshot(event,[3]);expect(hasMeetingChange(before,meetingChangeSnapshot({...event,start_at:'2099-09-22 19:00:00'},[3]))).toBe(true);expect(hasMeetingChange(before,meetingChangeSnapshot(event,[3,4]))).toBe(true);});
 it('cancels a pending notice when notify is unchecked',async()=>{await queueMeetingChange(event,meetingChangeSnapshot(event,[]),false);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(true);});
 it('debounces for five minutes and keeps the original comparison baseline',async()=>{await queueMeetingChange(event,meetingChangeSnapshot({...event,title:'Before'},[]),true);const [sql]=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));expect(sql).toContain('INTERVAL 5 MINUTE');expect(sql.split('ON DUPLICATE KEY UPDATE')[1]).not.toContain('baseline_json=');});
});
