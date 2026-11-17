import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({db:vi.fn(),find:vi.fn(),billing:vi.fn(),elapsed:vi.fn(),settle:vi.fn(),lock:vi.fn(),participants:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.db}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find,getBilling:m.billing,listParticipants:m.participants}}));
vi.mock('../qaAppointmentBilling.service.js',()=>({requireQaOutcomeElapsed:m.elapsed}));
vi.mock('../appointment.service.js',()=>({settleAppointment:m.settle}));
vi.mock('../clientSchedulingGuard.service.js',()=>({withClientSchedulingLock:m.lock}));
import {linkedTutoringBilling,requireLinkedTutoringCompletion,settleLinkedTutoringCompletion} from '../tutoringAppointmentSettlement.service.js';
const session={id:90,organization_id:453,provider_user_id:1496,mode:'individual',actual_started_at:'2026-11-16 20:00:00',metadata_json:{learningServiceCode:'TUTORING'}};
const appointment={id:331,agencyId:453,providerUserId:1496,businessType:'tutoring',serviceCode:'TUTORING',status:'scheduled'};
beforeEach(()=>{
 vi.resetAllMocks();m.db.mockImplementation(async sql=>sql.startsWith('SELECT appointment_id')?[[{appointment_id:331}]]:[[{id:331,client_id:2545}]]);
 m.find.mockResolvedValue(appointment);m.billing.mockResolvedValue({amountCents:100,settlementMode:'self_pay'});m.elapsed.mockResolvedValue();m.settle.mockResolvedValue({settlement:{paymentStatus:'fee_pending'}});m.lock.mockImplementation(async(_ids,work)=>work());
 m.participants.mockResolvedValue([{clientId:2545}]);
});
it('resolves only the explicit appointment bridge and exact agency/provider/student roster',async()=>{
 const binding=await linkedTutoringBilling(session);expect(binding).toMatchObject({appointment,clientId:2545,billing:{amountCents:100},noAutomaticPayment:true});
 expect(m.db.mock.calls[1][0]).toContain('p.client_id=r.client_id');expect(m.db.mock.calls[1][1]).toEqual([90,453,1496]);expect(m.db.mock.calls[1][0]).not.toMatch(/start_at|starts_at/);
});
it('does not infer an appointment for an unlinked visit',async()=>{m.db.mockResolvedValue([[]]);expect(await linkedTutoringBilling(session)).toBeNull();expect(m.find).not.toHaveBeenCalled();});
it('fails closed when an explicit bridge has the wrong roster, agency or provider',async()=>{
 m.db.mockImplementation(async sql=>sql.startsWith('SELECT appointment_id')?[[{appointment_id:331}]]:[[]]);await expect(linkedTutoringBilling(session)).rejects.toMatchObject({status:409});expect(m.find).not.toHaveBeenCalled();
});
it('refuses multiple bridge targets',async()=>{m.db.mockResolvedValue([[{appointment_id:331},{appointment_id:332}]]);await expect(linkedTutoringBilling(session)).rejects.toMatchObject({status:409});});
it('rechecks a changed canonical appointment',async()=>{m.find.mockResolvedValue({...appointment,agencyId:6});await expect(linkedTutoringBilling(session)).rejects.toMatchObject({status:409});});
it('does not charge or debit merely prepared sessions',async()=>{const binding=await linkedTutoringBilling(session);await expect(requireLinkedTutoringCompletion(binding,{...session,actual_started_at:null})).rejects.toMatchObject({status:409});expect(m.elapsed).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();});
it('uses the real QA outcome guard before completion',async()=>{const binding=await linkedTutoringBilling(session);m.elapsed.mockRejectedValue(Object.assign(new Error('Session has not ended'),{status:409}));await expect(requireLinkedTutoringCompletion(binding,session)).rejects.toMatchObject({status:409});expect(m.settle).not.toHaveBeenCalled();});
it('routes retries through the existing idempotent appointment settlement under the client lock',async()=>{
 const binding=await linkedTutoringBilling(session);await settleLinkedTutoringCompletion(binding,1496);await settleLinkedTutoringCompletion(binding,1496);
 expect(m.lock).toHaveBeenCalledWith([2545],expect.any(Function));expect(m.settle).toHaveBeenCalledWith(331,{outcome:'completed',actorUserId:1496});
});
it('never reopens a concurrently canceled appointment to charge it',async()=>{const binding=await linkedTutoringBilling(session);m.find.mockResolvedValue({...appointment,status:'canceled_by_guardian'});expect(await settleLinkedTutoringCompletion(binding,1496)).toHaveProperty('billingWarning');expect(m.settle).not.toHaveBeenCalled();});
it('withholds settlement after the booked student changes',async()=>{const binding=await linkedTutoringBilling(session);m.participants.mockResolvedValue([{clientId:2547}]);expect(await settleLinkedTutoringCompletion(binding,1496)).toHaveProperty('billingWarning');expect(m.settle).not.toHaveBeenCalled();});
it('keeps completion evidence while returning an actionable billing review warning',async()=>{const binding=await linkedTutoringBilling(session);m.settle.mockRejectedValue(new Error('Review package credit'));expect(await settleLinkedTutoringCompletion(binding,1496)).toEqual({billingWarning:'Session ended; billing needs office review: Review package credit'});});
it.each([{mode:'group'},{metadata_json:{learningServiceCode:'HOMEWORK HELP'}}])('leaves separate group/other-service billing unchanged: %j',async patch=>{expect(await linkedTutoringBilling({...session,...patch})).toBeNull();expect(m.db).not.toHaveBeenCalled();});
