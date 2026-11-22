import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({providerIssue:vi.fn(),context:vi.fn(),agency:vi.fn(),access:vi.fn(),memberships:vi.fn(),eligibility:vi.fn(),session:vi.fn(),officeSession:vi.fn()}));
vi.mock('../../services/providerServiceOfferings.service.js',()=>({clinicalProviderIssue:m.providerIssue}));
vi.mock('../../services/clientServiceContext.service.js',()=>({clinicalBookingContextIssue:m.context}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../utils/noteAidClientAgency.js',()=>({listClientAgencyMembershipIds:m.memberships}));
vi.mock('../../services/clientPayerServiceEligibility.service.js',()=>({clientPayerServiceEligibility:m.eligibility}));
vi.mock('../../models/clinical/ClinicalSession.model.js',()=>({default:{findById:m.session,findByOfficeEventAndClient:m.officeSession}}));
import {getClientServiceCodeEligibility} from '../clientServiceCodeEligibility.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue('');m.providerIssue.mockResolvedValue('');m.access.mockResolvedValue({ok:true});m.memberships.mockResolvedValue([2]);m.eligibility.mockResolvedValue({serviceCodes:['90837'],program:'commercial'});});
const request=()=>({user:{id:8,role:'provider'},query:{agencyId:'2',clientId:'3',dateOfService:'2026-11-16'}});
async function call(req){const res={set:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await getClientServiceCodeEligibility(req,res,next);return{res,next};}
it('returns only choices for an authorized client and scoped provider',async()=>{const {res,next}=await call(request());expect(next).not.toHaveBeenCalled();expect(m.eligibility).toHaveBeenCalledWith({agencyId:2,clientId:3,providerUserId:8,dateOfService:'2026-11-16'});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({serviceCodes:['90837'],program:'commercial',agencyId:2});});
it('blocks clients outside the practice even when chart access exists',async()=>{m.memberships.mockResolvedValue([7]);const {next}=await call(request());expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();});
it('blocks unassigned client records and cannot inspect another provider as a provider',async()=>{m.access.mockResolvedValueOnce({ok:false});expect((await call(request())).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));const req=request();req.query.providerId=9;expect((await call(req)).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();});
it('rejects malformed identifiers and impossible dates before reading policies',async()=>{for(const change of [{clientId:'-1'},{dateOfService:'2026-02-30'}])expect((await call({...request(),query:{...request().query,...change}})).next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(m.eligibility).not.toHaveBeenCalled();});
const session={id:90,agency_id:7,client_id:3,provider_user_id:8,office_event_id:460,scheduled_start_at:'2026-11-16 16:00:00',source_timezone:'America/Denver'};
it('uses an explicit authorized session agency instead of the shell agency without guessing',async()=>{
 m.memberships.mockResolvedValue([7]);m.session.mockResolvedValue(session);
 const req=request();req.query.clinicalSessionId='90';
 const {res,next}=await call(req);expect(next).not.toHaveBeenCalled();
 expect(m.agency).toHaveBeenCalledWith({reqUser:req.user,agencyId:2});expect(m.agency).toHaveBeenCalledWith({reqUser:req.user,agencyId:7});
 expect(m.eligibility).toHaveBeenCalledWith({agencyId:7,clientId:3,providerUserId:8,dateOfService:'2026-11-16'});
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({agencyId:7}));
});
it.each([{client_id:99},{provider_user_id:99}])('never resolves another client or provider session through the shell: %j',async mismatch=>{
 m.memberships.mockResolvedValue([7]);m.session.mockResolvedValue({...session,...mismatch});const req=request();req.query.clinicalSessionId=90;
 expect((await call(req)).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();
});
it('rejects date or office-event disagreement even for an otherwise authorized session',async()=>{
 m.memberships.mockResolvedValue([7]);m.session.mockResolvedValue(session);const req=request();req.query.clinicalSessionId=90;req.query.officeEventId=461;
 expect((await call(req)).next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.eligibility).not.toHaveBeenCalled();
});
it('does not use a session to bypass access to its actual agency',async()=>{
 m.memberships.mockResolvedValue([7]);m.session.mockResolvedValue(session);m.agency.mockImplementation(async({agencyId})=>{if(agencyId===7)throw Object.assign(new Error('Denied'),{status:403});});
 const req=request();req.query.clinicalSessionId=90;
 expect((await call(req)).next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.eligibility).not.toHaveBeenCalled();
});

it('omits clinical codes for a new learning-only visit before looking up payer policy',async()=>{
 m.context.mockResolvedValueOnce('Choose a clinical assignment.');
 const {res,next}=await call(request());
 expect(next).not.toHaveBeenCalled();
 expect(m.context).toHaveBeenCalledWith({agencyId:2,clientIds:[3],providerId:8});
 expect(m.eligibility).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith({serviceCodes:[],agencyId:2,message:'Choose a clinical assignment.'});
});

it('also requires the selected provider to offer Clinical for a new visit',async()=>{
 m.providerIssue.mockResolvedValueOnce('Learning only.');
 const {res}=await call(request());
 expect(m.providerIssue).toHaveBeenCalledWith(2,8);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({serviceCodes:[]}));
 expect(m.eligibility).not.toHaveBeenCalled();
});
