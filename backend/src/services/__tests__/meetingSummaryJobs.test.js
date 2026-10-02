import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),generate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../teamMeetingTranscriptSummary.service.js',()=>({generateTeamMeetingSummaryFromTranscript:mocks.generate}));
import {enqueueMeetingSummary,processMeetingSummaryJobs} from '../meetingSummaryJobs.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.generate.mockResolvedValue({ok:true});});
describe('durable meeting summary jobs',()=>{
 it('queues without making an AI call in the request',async()=>{
  mocks.execute.mockResolvedValue([{affectedRows:1}]);
  expect(await enqueueMeetingSummary('team',7)).toEqual({ok:true,status:'queued'});expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls[0][0]).toContain("status='generating'");
 });
 it('claims with an expiring lease, generates, and marks ready only after completion',async()=>{
  mocks.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{meeting_type:'team',meeting_id:7}]])
   .mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:0}]);
  await processMeetingSummaryJobs();expect(mocks.generate).toHaveBeenCalledWith(7);
  expect(mocks.execute.mock.calls[0][0]).toContain('lease_until<UTC_TIMESTAMP()');
  expect(mocks.execute.mock.calls[2][0]).toContain("'queued','ready'");
 });
 it('persists failure/retry state without leaking transcript or vendor error text',async()=>{
  mocks.generate.mockRejectedValue(new Error('sensitive vendor payload'));
  mocks.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{meeting_type:'team',meeting_id:7}]])
   .mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:0}]);
  await processMeetingSummaryJobs();expect(mocks.execute.mock.calls[2][0]).toContain("attempts<3,'queued','failed'");
  expect(JSON.stringify(mocks.execute.mock.calls)).not.toContain('sensitive vendor');
 });
});
