import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/LearningClassSession.model.js',()=>({default:{findById:vi.fn(),completeOnce:vi.fn()}}));
vi.mock('../nluTutoringVideoChoice.service.js',()=>({nluTutoringVideoChoice:vi.fn(async()=>true)}));
vi.mock('../appointment.service.js',()=>({settleAppointment:vi.fn(async()=>({settlement:{source:'selected-service'}}))}));
vi.mock('../tutoringPayroll.service.js',()=>({createTutoringPayrollDraft:vi.fn()}));
vi.mock('../clientSchedulingGuard.service.js',()=>({withClientSchedulingLock:async(ids,work)=>work()}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import LearningClassSession from '../../models/LearningClassSession.model.js';
import {settleAppointment} from '../appointment.service.js';
import {createTutoringPayrollDraft} from '../tutoringPayroll.service.js';
import {finishNluHubActivities} from '../nluSessionHubCompletion.service.js';
let a,s,ctx;
beforeEach(()=>{
 vi.clearAllMocks();a={id:1,agencyId:6,providerUserId:20,serviceCode:'H2014',businessType:'mental_health',status:'in_progress'};
 s={id:2,status:'live',actual_started_at:'2026-11-28 17:00:00',actual_ended_at:'2026-11-28 18:00:00',metadata_json:{sessionHubActivitiesOnly:true,sourceServiceCode:'H2014',sourceBusinessType:'mental_health'}};
 ctx={host:true,clientId:40,appointment:{...a},req:{user:{id:20}}};Appointment.findById.mockImplementation(async()=>a);Appointment.listParticipants.mockResolvedValue([{clientId:40}]);LearningClassSession.findById.mockImplementation(async()=>s);pool.execute.mockResolvedValue([[{appointment_id:1}]]);
});
it('completes the exact original service without creating a tutoring payroll draft or replacing its code',async()=>{
 expect(await finishNluHubActivities(ctx,2)).toMatchObject({billingSettlement:{source:'selected-service'},payrollDraft:null});
 expect(settleAppointment).toHaveBeenCalledWith(1,{outcome:'completed',actorUserId:20});expect(a.serviceCode).toBe('H2014');expect(createTutoringPayrollDraft).not.toHaveBeenCalled();
});
it('keeps Homework Help on its existing distinct compensation path',async()=>{
 a.serviceCode='HOMEWORK HELP';a.businessType='learning';s.metadata_json.sourceServiceCode='HOMEWORK HELP';s.metadata_json.sourceBusinessType='learning';
 await finishNluHubActivities(ctx,2);expect(createTutoringPayrollDraft).toHaveBeenCalledWith(2,20);
});
it.each(['code','provider','student','canceled','missing-start'])('preserves existing financial records when %s does not match',async change=>{
 if(change==='code')a.serviceCode='90837';if(change==='provider')a.providerUserId=21;if(change==='student')Appointment.listParticipants.mockResolvedValue([{clientId:41}]);if(change==='canceled')a.status='canceled_by_client';if(change==='missing-start')s.actual_started_at=null;
 await expect(finishNluHubActivities(ctx,2)).rejects.toHaveProperty('status',409);expect(settleAppointment).not.toHaveBeenCalled();expect(createTutoringPayrollDraft).not.toHaveBeenCalled();
});
