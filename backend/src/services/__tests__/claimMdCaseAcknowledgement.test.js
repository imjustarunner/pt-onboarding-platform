import { beforeEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),scope:vi.fn(),overview:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../controllers/supervisedBilling.controller.js',()=>({documentationScope:m.scope}));
vi.mock('../supervisionCaseReview.service.js',()=>({buildSupervisionCaseOverview:m.overview,listSupervisionCases:vi.fn()}));
import { getSupervisionCaseOverview,acknowledgeSupervisionCase } from '../../controllers/supervisionCaseReview.controller.js';
const req=()=>({user:{id:5},params:{providerId:'7',clientId:'3'},query:{agencyId:1},body:{agencyId:1,attested:true,contentHash:'current'}});
const res=()=>({json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.scope.mockResolvedValue({agencyId:1,providerUserId:7,canReview:true,canAttest:false});m.overview.mockResolvedValue({clientId:3,contentHash:'current',recentNotes:[],treatmentPlans:[]});m.execute.mockResolvedValue([[]]);});
describe('case acknowledgements are audited reviews, never cosigns',()=>{
  it('requires assigned reviewer access and records only the current source digest',async()=>{
    const r=req(),response=res();await acknowledgeSupervisionCase(r,response,e=>{throw e;});
    expect(m.scope).toHaveBeenCalledWith(r,{reviewerOnly:true});
    expect(m.execute).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("'acknowledged'"),[1,7,5,3,'current']);expect(response.json).toHaveBeenCalledWith({ok:true});
  });
  it('rejects stale acknowledgements without saving',async()=>{
    const r=req();r.body.contentHash='old';const next=vi.fn();await acknowledgeSupervisionCase(r,res(),next);expect(next.mock.calls[0][0].status).toBe(409);expect(m.execute).not.toHaveBeenCalled();
  });
  it('stops before loading any case when permission fails',async()=>{
    m.scope.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));const next=vi.fn();await getSupervisionCaseOverview(req(),res(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.overview).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
  });
  it('does not return chart content when durable view auditing fails',async()=>{
    m.execute.mockRejectedValue(new Error('Audit unavailable'));const response=res(),next=vi.fn();await getSupervisionCaseOverview(req(),response,next);expect(response.json).not.toHaveBeenCalled();expect(next.mock.calls[0][0].message).toBe('Audit unavailable');
  });
  it('does not present an older-source acknowledgement as current',async()=>{
    m.execute.mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{content_hash:'old',created_at:'2026-09-20'}]]);const response=res();await getSupervisionCaseOverview(req(),response,e=>{throw e;});expect(response.json.mock.calls[0][0].acknowledgedAt).toBeNull();
  });
});
