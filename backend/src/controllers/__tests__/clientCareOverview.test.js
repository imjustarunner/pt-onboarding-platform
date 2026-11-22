import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),agency:vi.fn(),save:vi.fn(),fiscal:vi.fn(async()=>({total:3})),plan:vi.fn(async()=>({eligible:true})),alerts:vi.fn(async()=>[])}));
vi.mock('../clientQuickView.controller.js',()=>({requireOverviewAccess:m.access}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../../services/clientFiscalSessions.service.js',()=>({recordFiscalBaseline:m.save,loadClientFiscalSessions:m.fiscal}));
vi.mock('../../services/treatmentPlanEncounterEligibility.service.js',()=>({loadEncounterTreatmentPlanEligibility:m.plan}));
vi.mock('../../services/clinicalDiagnosisPolicy.service.js',()=>({listClientDiagnosisAlerts:m.alerts}));
import {clientCareOverview,saveClientFiscalBaseline} from '../clientCareOverview.controller.js';
function response(){const res={set:vi.fn(),json:vi.fn()};res.set.mockReturnValue(res);return res;}
it('requires both chart and agency clinical authorization before exposing counts or alerts',async()=>{
 m.access.mockRejectedValueOnce(Object.assign(Error('Wrong chart'),{status:403}));const next=vi.fn();m.fiscal.mockClear();
 await clientCareOverview({user:{id:9,role:'provider'},params:{id:'12'},query:{agencyId:'3'}},response(),next);expect(next.mock.calls[0][0].status).toBe(403);expect(m.fiscal).not.toHaveBeenCalled();
});
it('attributes a staff-entered historical revision to the authenticated actor, never an input actor',async()=>{
 m.access.mockResolvedValue();m.agency.mockResolvedValue();m.save.mockResolvedValue();const res=response(),input={agencyId:2,count:22,actorUserId:99};
 await saveClientFiscalBaseline({user:{id:9,role:'provider'},params:{id:'12'},query:{},body:input},res,vi.fn());expect(m.save).toHaveBeenCalledWith({agencyId:2,clientId:12,actorUserId:9,input});expect(m.agency).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,requireClinicalService:true}));
});
