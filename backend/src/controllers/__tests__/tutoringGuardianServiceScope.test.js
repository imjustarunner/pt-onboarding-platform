import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),dashboard:vi.fn(),subjects:vi.fn(),status:vi.fn(),entry:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../utils/learningAccess.js',()=>({assertLearningClientAccess:m.access}));
vi.mock('../../utils/learningClassAccess.js',()=>({assertLearningSessionAccess:vi.fn()}));
vi.mock('../../services/tutoringLearningOs.service.js',()=>({getGuardianTutoringDashboard:m.dashboard,StudentSubject:{listByClient:m.subjects}}));
vi.mock('../../services/guardianTutoringOffice.service.js',()=>({guardianTutoringOfficeStatus:m.status,guardianTutoringOfficeEntry:m.entry,startGuardianOfficeVisit:vi.fn()}));
import {getGuardianDashboard,listSubjects,getGuardianOfficeStatus,getGuardianOfficeEntry} from '../tutoringLearningOs.controller.js';
const req={user:{id:1759},params:{clientId:2545},query:{agencyId:453,serviceId:1042,source:'appointment',appointmentId:324}};
const res=()=>({json:vi.fn(),set:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({clientId:2545,agencyId:453,service:{id:1042,service_kind:'tutoring',provider_user_id:0},permissions:{}});m.dashboard.mockResolvedValue({});m.subjects.mockResolvedValue([{id:1,primary_tutor_user_id:1496},{id:2,primary_tutor_user_id:null}]);m.status.mockResolvedValue({offices:[]});m.entry.mockResolvedValue({});});
it('preserves explicit unassignment through the guardian dashboard and office adapters',async()=>{
 const next=vi.fn();await getGuardianDashboard(req,res(),next);await getGuardianOfficeStatus(req,res(),next);await getGuardianOfficeEntry(req,res(),next);
 expect(m.dashboard).toHaveBeenCalledWith(2545,{agencyId:453,providerId:0});expect(m.status).toHaveBeenCalledWith({clientId:2545,agencyId:453,providerId:0});expect(m.entry).toHaveBeenCalledWith({clientId:2545,agencyId:453,providerId:0},req.query);expect(next).not.toHaveBeenCalled();
});
it('does not expose another assigned or unassigned subject when the selected service has no tutor',async()=>{const response=res();await listSubjects(req,response,vi.fn());expect(response.json).toHaveBeenCalledWith({subjects:[]});});
