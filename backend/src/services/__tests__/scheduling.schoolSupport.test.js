import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../payrollPto.service.js',()=>({getAgencyPtoPolicy:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../schoolSupportRequest.service.js',()=>({schoolSupportAvailability:vi.fn(),createSchoolSupportRequest:vi.fn()}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import {getAgencyPtoPolicy} from '../payrollPto.service.js';
import {readClientInsurance} from '../clientInsurance.service.js';
import {schoolSupportAvailability,createSchoolSupportRequest} from '../schoolSupportRequest.service.js';
import {appointmentSchoolSupportContext,reserveCancellationSchoolSupport} from '../appointmentSchoolSupport.service.js';
let appointment,client,policy,request;
const args={appointmentId:1,actorUserId:10,eventType:'canceled',clientId:20};
beforeEach(()=>{
 vi.clearAllMocks();
 appointment={id:1,agencyId:2,providerUserId:10,startAt:'2026-10-21 00:30:00',sourceTimezone:'America/Denver'};
 client={client_type:'school',default_place_of_service:'03',insurance_type:'Medicaid'};
 policy={ptoEnabled:true,schoolSupportEnabled:true,schoolSupportAccrualAfter:'2026-10-09'};request=null;
 Appointment.findById.mockImplementation(async()=>appointment);
 Appointment.listParticipants.mockResolvedValue([{clientId:20,isBillingResponsible:true}]);
 readClientInsurance.mockResolvedValue(null);
 getAgencyPtoPolicy.mockImplementation(async()=>({policy}));
 schoolSupportAvailability.mockResolvedValue({balanceHours:3,pendingHours:1,availableHours:2});
 pool.execute.mockImplementation(async(sql)=>sql.includes('FROM clients')?[[client]]:[[request].filter(Boolean)]);
});
describe('school session cancellation benefit',()=>{
 it('shows earned, pending and available hours using the school session local date',async()=>{
  expect(await appointmentSchoolSupportContext(args)).toMatchObject({eligible:true,balanceHours:3,pendingHours:1,availableHours:2,canRequest:true,useDate:'2026-10-20'});
 });
 it.each(['rescheduled','void'])('does not offer support for %s',async(eventType)=>{
  expect(await appointmentSchoolSupportContext({...args,eventType})).toEqual({eligible:false});expect(schoolSupportAvailability).not.toHaveBeenCalled();
 });
 it('does not expose the provider balance to other staff, clients or administrators',async()=>{
  expect(await appointmentSchoolSupportContext({...args,actorUserId:30})).toEqual({eligible:false});
  expect(Appointment.listParticipants).not.toHaveBeenCalled();expect(pool.execute).not.toHaveBeenCalled();
  await expect(reserveCancellationSchoolSupport({appointmentId:1,actorUserId:30,facts:{useSchoolSupportHour:true,eventType:'canceled'},db:pool})).rejects.toMatchObject({status:403});
 });
 it('uses the child’s coverage when a guardian is the billing contact',async()=>{
  Appointment.listParticipants.mockResolvedValue([{role:'guardian',isBillingResponsible:true},{role:'client',clientId:20,isBillingResponsible:false}]);
  expect((await appointmentSchoolSupportContext({...args,clientId:null})).eligible).toBe(true);
  expect(readClientInsurance).toHaveBeenCalledWith(20,2,pool);
 });
 it('does not trust a client outside the appointment',async()=>{
  expect(await appointmentSchoolSupportContext({...args,clientId:999})).toEqual({eligible:false});expect(pool.execute).not.toHaveBeenCalled();
 });
 it('excludes a school client whose session is explicitly at an office',async()=>{
  appointment.serviceLocationId=5;Object.assign(client,{location_id:5,location_kind:'office',place_of_service:'11'});
  expect(await appointmentSchoolSupportContext(args)).toEqual({eligible:false});
 });
 it('allows a school service location for an otherwise clinical client',async()=>{
  Object.assign(client,{client_type:'clinical',default_place_of_service:'11',location_id:5,location_kind:'school',place_of_service:'03'});
  expect((await appointmentSchoolSupportContext(args)).eligible).toBe(true);
 });
 it('recognizes Medicaid as secondary coverage',async()=>{
  client.insurance_type='Commercial';readClientInsurance.mockResolvedValue({secondary:{insurerName:'Health First Colorado',isMedicaid:true}});
  expect((await appointmentSchoolSupportContext(args)).eligible).toBe(true);
 });
 it('excludes non-Medicaid coverage',async()=>{
  client.insurance_type='Commercial';expect(await appointmentSchoolSupportContext(args)).toEqual({eligible:false});
 });
 it('preserves the legacy claim period and disabled policy',async()=>{
  appointment.startAt='2026-10-10 01:00:00';expect(await appointmentSchoolSupportContext(args)).toEqual({eligible:false});
  appointment.startAt='2026-10-21 00:30:00';policy.schoolSupportEnabled=false;
  expect(await appointmentSchoolSupportContext(args)).toEqual({eligible:false});
 });
 it('shows a zero available balance but cannot request an hour',async()=>{
  schoolSupportAvailability.mockResolvedValue({balanceHours:1,pendingHours:1,availableHours:0});
  expect(await appointmentSchoolSupportContext(args)).toMatchObject({eligible:true,canRequest:false,availableHours:0});
 });
 it('shows the existing request and prevents a second selection',async()=>{
  request={id:90,status:'submitted',total_hours:'1.00'};
  expect(await appointmentSchoolSupportContext(args)).toMatchObject({canRequest:false,request:{id:90,status:'submitted',hours:1}});
 });
 it('reserves exactly one hour for an opted-in cancellation without creating an insurance claim',async()=>{
  await reserveCancellationSchoolSupport({appointmentId:1,actorUserId:10,facts:{useSchoolSupportHour:true,eventType:'canceled',clientId:20},db:pool});
  expect(createSchoolSupportRequest).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,userId:10,actorId:10,sourceAppointmentId:1,items:[{date:'2026-10-20',hours:1}],db:pool}));
  expect(createSchoolSupportRequest.mock.calls[0][0].notes).not.toContain('20');
 });
 it('does nothing without explicit selection',async()=>{
  await reserveCancellationSchoolSupport({appointmentId:1,actorUserId:10,facts:{eventType:'canceled'},db:pool});expect(createSchoolSupportRequest).not.toHaveBeenCalled();
 });
});
