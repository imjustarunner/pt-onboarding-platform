import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),enqueue:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../teamMeetingTranscriptSummary.service.js',()=>({triggerTeamMeetingSummaryFromTranscript:m.enqueue}));
import {completeEmptyPastMeetings} from '../meetingAutoCompletion.service.js';
beforeEach(()=>{vi.clearAllMocks();m.enqueue.mockResolvedValue({ok:true});});
it('does not close a meeting when someone reconnects after candidate selection',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT e.id FROM provider_schedule_events e\n    WHERE')?[[{id:7}]]:sql.startsWith('UPDATE')?[{affectedRows:0}]:[[]]);
 expect(await completeEmptyPastMeetings()).toBe(0);expect(m.enqueue).not.toHaveBeenCalled();
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))[0]).toContain('p.left_at IS NULL');
});
it('recovers summary enqueue after completion was saved but the previous worker failed',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('LEFT JOIN meeting_summary_jobs')?[[{id:7}]]:[[]]);
 expect(await completeEmptyPastMeetings()).toBe(0);expect(m.enqueue).toHaveBeenCalledWith(7);
});
