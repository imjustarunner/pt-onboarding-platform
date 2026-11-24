import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({reactivate:vi.fn(),execute:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:mocks.execute,beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release})}}));
vi.mock('../clientReactivation.service.js',()=>({reactivateClientForActivity:mocks.reactivate}));
import {ensureCompanyEventClientEnrollment} from '../companyEventClientEnrollmentSync.service.js';
import {reactivateConfirmedAppointmentClients} from '../appointmentClientReactivation.service.js';
let prior,savedAppointment;
beforeEach(()=>{
 vi.clearAllMocks();mocks.reactivate.mockResolvedValue({reactivated:true});prior=null;savedAppointment={id:12,agency_id:2,created_by_user_id:7};
 mocks.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM clients WHERE id='))return [[{id:8}]];
  if(sql.includes('FROM company_event_clients'))return [prior?[prior]:[]];
  if(sql.includes('FROM appointments'))return [savedAppointment?[savedAppointment]:[]];
  if(sql.includes('FROM appointment_participants'))return [[{client_id:8},{client_id:9}]];
  return [{affectedRows:1}];
 });
});
it('records a new event enrollment and its reactivation in one transaction',async()=>{
 await ensureCompanyEventClientEnrollment({eventId:12,agencyId:2,clientId:8,actorUserId:7});
 expect(mocks.reactivate).toHaveBeenCalledWith(expect.objectContaining({clientId:8,agencyId:2,trigger:'event_registration',actorUserId:7}),expect.objectContaining({executor:expect.objectContaining({execute:mocks.execute})}));
 expect(mocks.commit).toHaveBeenCalledOnce();
});
it('does not treat replaying an existing active event registration as a new activity',async()=>{
 prior={id:40,is_active:1};await ensureCompanyEventClientEnrollment({eventId:12,agencyId:2,clientId:8,actorUserId:7});expect(mocks.reactivate).not.toHaveBeenCalled();
});
it('rolls back a new registration if its reactivation audit fails',async()=>{
 mocks.reactivate.mockRejectedValueOnce(Error('AUDIT_FAILED'));await expect(ensureCompanyEventClientEnrollment({eventId:12,agencyId:2,clientId:8,actorUserId:7})).rejects.toThrow('AUDIT_FAILED');
 expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
});
it('reactivates only new, persisted participants of a confirmed future appointment',async()=>{
 const executor={execute:mocks.execute};await reactivateConfirmedAppointmentClients(12,{executor,clientIds:[9,999]});
 expect(mocks.reactivate).toHaveBeenCalledOnce();expect(mocks.reactivate).toHaveBeenCalledWith(expect.objectContaining({clientId:9,agencyId:2,trigger:'confirmed_appointment',actorUserId:7}),{executor});
 expect(mocks.execute.mock.calls[0][0]).toContain("status IN ('scheduled','confirmed','client_confirmed') AND end_at>UTC_TIMESTAMP()");
});
it('does not activate from a canceled, draft, or historical appointment',async()=>{
 savedAppointment=null;expect(await reactivateConfirmedAppointmentClients(12,{executor:{execute:mocks.execute}})).toEqual({processed:0});expect(mocks.reactivate).not.toHaveBeenCalled();
});
