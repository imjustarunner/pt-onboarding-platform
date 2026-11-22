import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),event:vi.fn(),appointment:vi.fn(),participants:vi.fn(),context:vi.fn(),execute:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../../models/OfficeEvent.model.js',()=>({default:{findById:m.event}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findByOfficeEventId:m.appointment,listParticipants:m.participants}}));
vi.mock('../clientServiceContext.service.js',()=>({readClientServiceContext:m.context}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../clinicalWorkArchiveRead.service.js',()=>({assertClinicalWorkActive:vi.fn()}));
vi.mock('../testingEligibility.service.js',()=>({requireTestingEligibility:vi.fn()}));
import Clinical from '../clinicalEligibility.service.js';
const request={agencyId:2,clientId:7,officeEventId:30};
beforeEach(()=>{
 vi.resetAllMocks();
 m.client.mockResolvedValue({id:7,agency_id:2,client_type:'learning'});
 m.event.mockResolvedValue({status:'BOOKED',client_id:7,booked_provider_id:8});
 m.context.mockResolvedValue({serviceKinds:['counseling','tutoring']});
 m.appointment.mockResolvedValue({id:50,agencyId:2,providerUserId:8,businessType:'mental_health'});
 m.participants.mockResolvedValue([{clientId:7}]);
});
it('opens the clinical appointment on a mixed chart originally created for learning',async()=>{
 await expect(Clinical.assertBookedClinicalSession(request)).resolves.toMatchObject({client:{id:7}});
 expect(m.context).toHaveBeenCalledWith({agencyId:2,clientId:7,providerId:8});
});
it.each([{businessType:'tutoring'},{agencyId:3},{providerUserId:12},{businessType:null}])('rejects a mismatched appointment %j',async mismatch=>{
 m.appointment.mockResolvedValue({id:50,agencyId:2,providerUserId:8,businessType:'mental_health',...mismatch});
 await expect(Clinical.assertBookedClinicalSession(request)).rejects.toMatchObject({status:409});
});
it('rejects a learning-only client and another participant’s appointment',async()=>{
 m.context.mockResolvedValueOnce({serviceKinds:['tutoring']});
 await expect(Clinical.assertBookedClinicalSession(request)).rejects.toMatchObject({status:409});
 m.participants.mockResolvedValue([{clientId:11}]);
 await expect(Clinical.assertBookedClinicalSession(request)).rejects.toMatchObject({status:409});
});
it('retains an existing billing-backed clinical session after the matching service ends',async()=>{
 const session={id:34,agency_id:2,client_id:7,provider_user_id:8,billing_encounter_id:40};
 m.execute.mockResolvedValueOnce([[{id:90}]]).mockResolvedValueOnce([[]]);
 await expect(Clinical.assertSessionNoteEligible(session)).resolves.toMatchObject({billingBacked:true});
 expect(m.execute.mock.calls[0][1]).toEqual([7,2,8]);
 expect(m.execute.mock.calls[0][0]).not.toContain('is_active');
 await expect(Clinical.assertSessionNoteEligible(session)).rejects.toMatchObject({status:409});
});
