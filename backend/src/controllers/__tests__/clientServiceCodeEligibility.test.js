import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),access:vi.fn(),memberships:vi.fn(),eligibility:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../utils/noteAidClientAgency.js',()=>({listClientAgencyMembershipIds:m.memberships}));
vi.mock('../../services/clientPayerServiceEligibility.service.js',()=>({clientPayerServiceEligibility:m.eligibility}));
import {getClientServiceCodeEligibility} from '../clientServiceCodeEligibility.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({ok:true});m.memberships.mockResolvedValue([2]);m.eligibility.mockResolvedValue({serviceCodes:['90837'],program:'commercial'});});
const request=()=>({user:{id:8,role:'provider'},query:{agencyId:'2',clientId:'3',dateOfService:'2026-11-16'}});
async function call(req){const res={set:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await getClientServiceCodeEligibility(req,res,next);return{res,next};}
it('returns only choices for an authorized client and scoped provider',async()=>{const {res,next}=await call(request());expect(next).not.toHaveBeenCalled();expect(m.eligibility).toHaveBeenCalledWith({agencyId:2,clientId:3,providerUserId:8,dateOfService:'2026-11-16'});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({serviceCodes:['90837'],program:'commercial'});});
it('blocks clients outside the practice even when chart access exists',async()=>{m.memberships.mockResolvedValue([7]);const {next}=await call(request());expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();});
it('blocks unassigned client records and cannot inspect another provider as a provider',async()=>{m.access.mockResolvedValueOnce({ok:false});expect((await call(request())).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));const req=request();req.query.providerId=9;expect((await call(req)).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();});
it('rejects malformed identifiers and impossible dates before reading policies',async()=>{for(const change of [{clientId:'-1'},{dateOfService:'2026-02-30'}])expect((await call({...request(),query:{...request().query,...change}})).next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(m.eligibility).not.toHaveBeenCalled();});
