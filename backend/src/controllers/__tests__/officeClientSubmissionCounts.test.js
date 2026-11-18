import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/officeClientSubmissions.service.js',()=>({completeClientSubmission:vi.fn(),privateSubmission:vi.fn(),assertCheckinClientAccess:vi.fn(),attachClientSubmission:vi.fn(),attachCheckinSeries:vi.fn(),readSubmissionAnswers:vi.fn()}));
vi.mock('../../services/officeFeedbackSummary.service.js',()=>({readAccessibleFeedback:vi.fn(),summarizeFeedback:vi.fn()}));
import {countSubmissions} from '../officeClientSubmissions.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{unassigned:5}]]);});
const response=()=>({set:vi.fn().mockReturnThis(),json:vi.fn(),status:vi.fn().mockReturnThis()});
it('counts only the authenticated provider’s unassigned visits in current memberships without reading answers',async()=>{
 const res=response();await countSubmissions({user:{id:7},query:{providerId:999},body:{providerId:999}},res,vi.fn());
 expect(res.json).toHaveBeenCalledWith({unassigned:5});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
 const [sql,args]=m.execute.mock.calls[0];expect(args).toEqual([7]);expect(sql).toContain('COUNT(*)');expect(sql).toContain('s.client_id IS NULL');expect(sql).toContain('ua.is_active=1');expect(sql).not.toContain('answers_json');
});
it('returns numeric zero when no visits remain',async()=>{m.execute.mockResolvedValue([[{unassigned:'0'}]]);const res=response();await countSubmissions({user:{id:7}},res,vi.fn());expect(res.json).toHaveBeenCalledWith({unassigned:0});});
