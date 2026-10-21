import {beforeEach,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
const m=vi.hoisted(()=>({execute:vi.fn(),get:vi.fn(),update:vi.fn(),create:vi.fn(),list:vi.fn(),audit:vi.fn(),lock:vi.fn(),ctx:vi.fn(),send:vi.fn(),context:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../auricwell/repository.js',()=>({get:m.get,update:m.update,create:m.create,list:m.list,audit:m.audit,lockPractice:m.lock,transaction:fn=>fn({})}));
vi.mock('../auricwell/clientMessaging.js',()=>({practiceMessagingContext:m.ctx}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:m.context,sendClientPortalEmail:m.send}));
import {nativeResponseContext,applyNativeResponse,sendNativeAppointmentEmail} from '../auricwell/appointmentEmailResponse.js';
let ctx,appointment,patient,row;
beforeEach(()=>{
 vi.resetAllMocks();
 ctx={practiceId:'practice',practiceName:'ITSCO',agencyId:2,settings:{phiActivatedAt:'2026-01-01'}};
 appointment={id:'appointment',patientId:'patient',data:{start:'2030-01-02T20:00:00.000Z',end:'2030-01-02T21:00:00.000Z',status:'scheduled'}};
 patient={id:'patient',data:{email:'guardian@example.test'}};
 row={practice_id:'practice',native_appointment_id:'appointment',native_patient_id:'patient',recipient_hash:crypto.createHash('sha256').update(patient.data.email).digest('hex'),appointment_start:'2030-01-02 20:00:00',appointment_end:'2030-01-02 21:00:00'};
 m.ctx.mockResolvedValue(ctx);m.get.mockImplementation(async(_ctx,kind)=>kind==='patient'?patient:appointment);m.list.mockResolvedValue([]);m.context.mockResolvedValue({tenant:{name:'ITSCO'},brand:{clinical:true}});m.send.mockResolvedValue({id:'sent'});
});
it('stops native school email only and keeps office reminders available',async()=>{
 appointment.data.serviceSetting='school';
 m.execute.mockImplementation(async sql=>sql.includes('FROM school_session_email_preferences')?[[{disabled_at:new Date()}]]:[{affectedRows:1}]);
 expect(await sendNativeAppointmentEmail(ctx,patient.data.email,'School session',appointment)).toMatchObject({skipped:true,reason:'school_session_email_opted_out'});
 expect(m.send).not.toHaveBeenCalled();
 appointment.data.serviceSetting='office';await sendNativeAppointmentEmail(ctx,patient.data.email,'Office appointment',appointment);expect(m.send).toHaveBeenCalledTimes(1);
});
it('adds the scoped opt-out to native school mail before delivery',async()=>{
 appointment.data.serviceSetting='school';m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]);
 await sendNativeAppointmentEmail(ctx,patient.data.email,'School session',appointment);
 const sent=m.send.mock.calls[0][0];expect(sent.templateType).toBe('school_session_notice');expect(sent.schoolSessionScopeKey).toMatch(/^[a-f0-9]{64}$/);
 expect(sent.text).toContain('Stop in-school session emails for this child');expect(sent.html).toContain('/api/public/school-session-emails/');
});
it('validates the current patient, practice and appointment instead of trusting a stale email',async()=>{
 expect((await nativeResponseContext(row)).appointment.id).toBe('appointment');expect(m.update).not.toHaveBeenCalled();
 patient.data.email='changed@example.test';await expect(nativeResponseContext(row)).rejects.toThrow('access');
 patient.data.email='guardian@example.test';appointment.data.start='2030-01-03T20:00:00.000Z';await expect(nativeResponseContext(row)).rejects.toThrow('changed');
});
it('confirms under the practice lock and writes an audit record',async()=>{
 expect(await applyNativeResponse(await nativeResponseContext(row),'confirm')).toContain('confirmed');
 expect(m.lock).toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(ctx,appointment,expect.objectContaining({status:'confirmed'}),expect.anything());expect(m.audit).toHaveBeenCalled();
});
it.each(['cancel','reschedule','absence'])('routes %s to provider review without cancelling or charging',async action=>{
 await applyNativeResponse(await nativeResponseContext(row),action);
 expect(m.update).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledWith(ctx,'appointment_request',expect.objectContaining({requestType:action==='absence'?'cancel':action,status:'pending'}),{patientId:'patient'},expect.anything());
 if(action==='absence')expect(m.create.mock.calls[0][2].message).toContain('Do not assess a cancellation fee');
});
it('rejects an appointment changed after the response page opened',async()=>{
 const current=await nativeResponseContext(row);m.get.mockResolvedValue({...appointment,data:{...appointment.data,status:'cancelled'}});
 await expect(applyNativeResponse(current,'confirm')).rejects.toThrow('changed');expect(m.update).not.toHaveBeenCalled();
});
it('sends native AuricWell emails through the same branded path with hashed action tokens',async()=>{
 await sendNativeAppointmentEmail(ctx,patient.data.email,'Your appointment. For scheduling changes, contact your practice.',appointment);
 const sent=m.send.mock.calls[0][0];expect(sent.html).toContain('Confirm appointment');expect(sent.html).not.toContain('Reply Y');expect(sent.context.brand.clinical).toBe(true);
 const url=sent.html.match(/appointment-response\/([a-f0-9]{64})/)[1];expect(m.execute.mock.calls[0][1][0]).toBe(crypto.createHash('sha256').update(url).digest('hex'));
});
