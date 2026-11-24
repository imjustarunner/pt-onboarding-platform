import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({reactivate:vi.fn(),holds:vi.fn(),service:vi.fn(),execute:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release})}}));
vi.mock('../../services/appointmentClientReactivation.service.js',()=>({reactivateConfirmedAppointmentClients:m.reactivate}));
vi.mock('../../services/publicProviderHold.service.js',()=>({resolveClientProviderHolds:m.holds}));
vi.mock('../../services/clientServiceEnrollment.service.js',()=>({ensureClientService:m.service}));
import Appointment from '../Appointment.model.js';
let previous;
beforeEach(()=>{
 vi.clearAllMocks();m.reactivate.mockResolvedValue({processed:1});previous=[];
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT client_id'))return [previous.map(client_id=>({client_id}))];
  if(sql.startsWith('SELECT created_by_user_id'))return [[{agency_id:2,created_by_user_id:7,provider_user_id:9,business_type:'mental_health'}]];
  if(sql.startsWith('SELECT * FROM appointment_participants'))return [[]];
  return [{affectedRows:1}];
 });
});
it('reactivates a new client after the confirmed appointment participant is saved',async()=>{
 await Appointment.replaceParticipants(12,[{clientId:8}]);
 expect(m.reactivate).toHaveBeenCalledWith(12,expect.objectContaining({executor:expect.objectContaining({execute:m.execute}),clientIds:[8]}));
 expect(m.execute.mock.calls.findIndex(([sql])=>sql.includes('INSERT INTO appointment_participants'))).toBeGreaterThan(-1);expect(m.commit).toHaveBeenCalledOnce();
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT created_by_user_id'))[0]).toContain('client_confirmed');
});
it('does not reactivate a client when an existing appointment participant is merely rewritten',async()=>{
 previous=[8];await Appointment.replaceParticipants(12,[{clientId:8}]);expect(m.reactivate).not.toHaveBeenCalled();
});
it('reactivates only a newly added participant and keeps the previous participant historical',async()=>{
 previous=[8];await Appointment.replaceParticipants(12,[{clientId:8},{clientId:9}]);expect(m.reactivate).toHaveBeenCalledWith(12,expect.objectContaining({clientIds:[9]}));
});
it('rolls back the participant save if reactivation cannot be audited',async()=>{
 m.reactivate.mockRejectedValueOnce(Error('AUDIT_FAILED'));await expect(Appointment.replaceParticipants(12,[{clientId:8}])).rejects.toThrow('AUDIT_FAILED');expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();
});
