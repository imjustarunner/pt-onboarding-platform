import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),update:vi.fn(),evaluate:vi.fn(),cancel:vi.fn(),notify:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find,update:m.update}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}})}}));
vi.mock('../appointmentReminder.service.js',()=>({logCommunication:vi.fn()}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:async()=>({isSchool:false})}));
vi.mock('../bookingCancellationPolicy.service.js',()=>({evaluateCancel:m.evaluate}));
vi.mock('../appointment.service.js',()=>({cancelAppointment:m.cancel}));
vi.mock('../notificationDispatcher.service.js',()=>({default:{createNotificationAndDispatch:m.notify}}));
import {applyAppointmentReply} from '../appointmentReply.service.js';
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([{insertId:91}]);m.find.mockResolvedValue({id:68,agencyId:450,providerUserId:1433,startAt:'2099-11-02 17:00:00'});m.evaluate.mockResolvedValue({allowed:true,recommendedFeeCents:8000});});
it('keeps a late cancellation scheduled until the family acknowledges the exact fee',async()=>{
 const result=await applyAppointmentReply({appointmentId:68,agencyId:450,clientId:2271,rawBody:'N'});
 expect(result.status).toBe('pending_review');expect(result.ackMessage).toContain('$80.00');expect(result.ackMessage).toContain('https://app.itsco.health/auricwell-qa-demo/guardian?panel=appointments&clientId=2271&appointmentId=68');expect(m.cancel).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it('cancels a fee-free reply with a zero-fee race guard',async()=>{
 m.evaluate.mockResolvedValue({allowed:true,recommendedFeeCents:0});
 const result=await applyAppointmentReply({appointmentId:68,agencyId:450,clientId:2271,rawBody:'N'});
 expect(result.status).toBe('applied');expect(m.cancel).toHaveBeenCalledWith(68,expect.objectContaining({expectedFeeCents:0,actorRole:'client'}));
});
