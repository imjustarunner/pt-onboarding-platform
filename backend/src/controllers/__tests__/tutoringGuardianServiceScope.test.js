import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),dashboard:vi.fn(),subjects:vi.fn(),query:vi.fn(),status:vi.fn(),entry:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{query:m.query},onTableWrite:vi.fn()}));
vi.mock('../../utils/learningAccess.js',()=>({assertLearningClientAccess:m.access}));
vi.mock('../../utils/learningClassAccess.js',()=>({assertLearningSessionAccess:vi.fn()}));
vi.mock('../../services/tutoringLearningOs.service.js',()=>({getGuardianTutoringDashboard:m.dashboard,StudentSubject:{listByClient:m.subjects}}));
vi.mock('../../services/guardianTutoringOffice.service.js',()=>({guardianTutoringOfficeStatus:m.status,guardianTutoringOfficeEntry:m.entry,startGuardianOfficeVisit:vi.fn()}));
import {getGuardianDashboard,listSubjects,getGuardianOfficeStatus,getGuardianOfficeEntry} from '../tutoringLearningOs.controller.js';
import {getStudentTutoringSessions} from '../learningProgress.controller.js';
const req={user:{id:1759,role:'guardian'},params:{clientId:2545},query:{agencyId:453,serviceId:1042,source:'appointment',appointmentId:324}};
const res=()=>({json:vi.fn(),set:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({clientId:2545,agencyId:453,service:{id:1042,service_kind:'tutoring',provider_user_id:0},permissions:{}});m.dashboard.mockResolvedValue({});m.subjects.mockResolvedValue([{id:1,primary_tutor_user_id:1496},{id:2,primary_tutor_user_id:null}]);m.status.mockResolvedValue({offices:[]});m.entry.mockResolvedValue({});});
it('preserves explicit unassignment through the guardian dashboard and office adapters',async()=>{
 const next=vi.fn();await getGuardianDashboard(req,res(),next);await getGuardianOfficeStatus(req,res(),next);await getGuardianOfficeEntry(req,res(),next);
 expect(m.dashboard).toHaveBeenCalledWith(2545,{agencyId:453,providerId:0,serviceId:1042,recipientUserId:1759,portalContext:{clientId:2545,agencyId:453,service:{id:1042,service_kind:'tutoring',provider_user_id:0},permissions:{}}});expect(m.status).toHaveBeenCalledWith({clientId:2545,agencyId:453,providerId:0});expect(m.entry).toHaveBeenCalledWith({clientId:2545,agencyId:453,providerId:0},req.query);expect(next).not.toHaveBeenCalled();
});
it('does not expose another assigned or unassigned subject when the selected service has no tutor',async()=>{const response=res();await listSubjects(req,response,vi.fn());expect(response.json).toHaveBeenCalledWith({subjects:[]});});
it('passes the resolved service and denied appointment permission through without rebuilding an empty permission context',async()=>{const context={clientId:2545,agencyId:453,service:{id:1038,service_kind:'tutoring',provider_user_id:1496},permissions:{canViewProgress:true,canViewAppointments:false},services:[{id:1038,provider_user_id:1496}]};m.access.mockResolvedValue(context);await getGuardianDashboard(req,res(),vi.fn());expect(m.dashboard).toHaveBeenCalledWith(2545,{agencyId:453,providerId:1496,serviceId:1038,recipientUserId:1759,portalContext:context});});


it('returns no session rows for the selected unassigned family service', async () => {
  m.access.mockResolvedValue({ agencyId: 453, service: { id: 1042, is_active: true, service_kind: 'tutoring', provider_user_id: null } });
  const response = res();
  await getStudentTutoringSessions({ ...req, user: { id: 1759, role: 'guardian' }, params: { studentId: 2545 } }, response, vi.fn());
  expect(response.json).toHaveBeenCalledWith({ sessions: [] });
  expect(m.query).not.toHaveBeenCalled();
});

it('uses the exact enrolled service and omits expired or missed visits from the upcoming list', async () => {
  m.access.mockResolvedValue({ agencyId: 453, service: { id: 1038, is_active: true, service_kind: 'tutoring', provider_user_id: 1496 } });
  m.query.mockResolvedValue([[{ id: 55, org_slug: 'nlu-qa-demo', appointment_id: 419, service_id: 1038,
    ai_summary_json: { summary: 'Private draft' }, subject_label: 'Mathematics' }]]);
  const response = res();
  const next = vi.fn();
  await getStudentTutoringSessions({ ...req, user: { id: 1759, role: 'guardian' }, params: { studentId: 2545 }, query: { upcoming: '1' } }, response, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.query).toHaveBeenCalledWith(expect.stringContaining('serviceEnrollmentId'), [2545, 453, 1496, 1496, 1038, 10]);
  expect(m.query.mock.lastCall[0]).toContain('COALESCE(s.ends_at, s.starts_at) > UTC_TIMESTAMP()');
  expect(response.json).toHaveBeenCalledWith({ sessions: [expect.objectContaining({
    session_url: '/nlu-qa-demo/tutoring-session/appointment/419?agencyId=453&clientId=2545&serviceId=1038',
    ai_summary_json: null, subject_label: 'Mathematics'
  })] });
});
