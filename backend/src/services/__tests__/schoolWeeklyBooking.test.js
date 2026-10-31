import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:vi.fn()}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{getActiveAgencyIdForSchool:vi.fn()}}));
vi.mock('../../models/AgencyServiceLocation.model.js',()=>({default:{findByAgencyAndSchool:vi.fn()}}));
vi.mock('../../models/TenantService.model.js',()=>({default:{listForAgency:vi.fn()}}));
vi.mock('../../models/StaffServiceAssignment.model.js',()=>({default:{listServiceIdsForUser:vi.fn()}}));
vi.mock('../../models/AgencyMedicalServiceCode.model.js',()=>({default:{listByAgency:vi.fn()}}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({clientSessionBookingAccess:vi.fn()}));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import AgencyServiceLocation from '../../models/AgencyServiceLocation.model.js';
import TenantService from '../../models/TenantService.model.js';
import StaffServiceAssignment from '../../models/StaffServiceAssignment.model.js';
import AgencyMedicalServiceCode from '../../models/AgencyMedicalServiceCode.model.js';
import { clientSessionBookingAccess } from '../clientSessionBookingRollout.service.js';
import { schoolWeeklyContext, schoolWeeklyStart, schoolWeeklyPayload } from '../schoolWeeklyBooking.service.js';
import { expandAppointmentRecurrence } from '../../utils/appointmentRecurrence.js';
const slot={id:10,client_id:11,start_time:'08:30:00',end_time:'09:15:00',initials:'AB'};
const context={agencyId:450,providerUserId:1433,weekday:'Monday',serviceLocationId:99,timeZone:'America/Denver',slots:[slot],services:[{id:8,serviceCode:'90834'}]};
const input={slotId:10,tenantServiceId:8,startMode:'next_week',occurrenceCount:3};
const request={actor:{id:1433,role:'provider'},schoolId:451,providerUserId:1433,weekday:'Monday'};
beforeEach(()=>{
 vi.resetAllMocks();
 Agency.findById.mockImplementation(async id=>id===451?{id,name:'Cedar Grove',organization_type:'school'}:{id,timezone:'America/Denver'});
 OrganizationAffiliation.getActiveAgencyIdForOrganization.mockResolvedValue(450);
 User.getAgencies.mockResolvedValue([{id:450}]);
 pool.execute.mockImplementation(async sql=>sql.includes('FROM provider_school_assignments')?[[{id:1}]]:[[slot]]);
 clientSessionBookingAccess.mockResolvedValue({enabled:true});
 AgencyServiceLocation.findByAgencyAndSchool.mockResolvedValue({id:99});
 StaffServiceAssignment.listServiceIdsForUser.mockResolvedValue([8]);
 AgencyMedicalServiceCode.listByAgency.mockResolvedValue([]);
 TenantService.listForAgency.mockResolvedValue([
  {id:8,name:'Individual',serviceCode:'90834',isActive:true,isStaffBookable:true,allowsIndividual:true,modality:'EITHER'},
  {id:9,name:'Virtual',isActive:true,isStaffBookable:true,allowsIndividual:true,modality:'TELEHEALTH'},
  {id:10,name:'Unassigned',isActive:true,isStaffBookable:true,allowsIndividual:true,modality:'EITHER'}]);
});
describe('school weekly booking',()=>{
 it('uses the saved slot, school service setting, and existing recurrence contract without editing the school grid',()=>{
  const payload=schoolWeeklyPayload({context,input:{...input,clientId:999,providerUserId:999,serviceLocationId:999,startAt:'ignore'},today:'2026-10-30'});
  expect(payload).toMatchObject({agencyId:450,providerUserId:1433,serviceLocationId:99,startAt:'2026-11-02 08:30:00',endAt:'2026-11-02 09:15:00',recurrence:'WEEKLY',participants:[{clientId:11,role:'client'}]});
  expect(expandAppointmentRecurrence(payload).map(row=>row.startAt)).toEqual(['2026-11-02 08:30:00','2026-11-09 08:30:00','2026-11-16 08:30:00']);
  expect(context.slots[0]).toEqual(slot);
 });
 it('supports this week and custom on-or-after start dates, with no accidental past series',()=>{
  expect(schoolWeeklyStart({weekday:'Friday',startMode:'this_week',today:'2026-10-30'})).toBe('2026-10-30');
  expect(schoolWeeklyStart({weekday:'Tuesday',startMode:'date',startDate:'2026-11-04',today:'2026-10-30'})).toBe('2026-11-10');
  expect(()=>schoolWeeklyStart({weekday:'Monday',startMode:'this_week',today:'2026-10-30'})).toThrow('passed this week');
  expect(()=>schoolWeeklyStart({weekday:'Monday',startMode:'date',startDate:'2026-02-31',today:'2026-10-30'})).toThrow('valid start');
 });
 it.each([{slotId:999},{tenantServiceId:9},{occurrenceCount:0},{occurrenceCount:53}])('rejects stale slots, unassigned services and invalid counts: %j',patch=>{
  expect(()=>schoolWeeklyPayload({context,input:{...input,...patch},today:'2026-10-30'})).toThrow();
 });
 it('requires valid saved client times',()=>{
  expect(()=>schoolWeeklyPayload({context:{...context,slots:[{...slot,end_time:'08:00:00'}]},input,today:'2026-10-30'})).toThrow('valid start and end');
 });
 it('returns only eligible saved slots and assigned in-person services',async()=>{
  const result=await schoolWeeklyContext(request);
  expect(result).toMatchObject({enabled:true,agencyId:450,serviceLocationId:99,slots:[slot],services:[{id:8,serviceCode:'90834'}]});
  const slotSql=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM soft_schedule_slots'));
  expect(slotSql[1]).toEqual([451,1433,'Monday']);
  expect(slotSql[0]).toContain('cpa.service_day=s.weekday');
 });
 it.each([{actor:{id:1465,role:'school_staff'}},{providerUserId:1439}])('denies school staff and another provider’s schedule',async patch=>{
  await expect(schoolWeeklyContext({...request,...patch})).rejects.toMatchObject({status:403});
  expect(pool.execute).not.toHaveBeenCalled();
 });
 it('denies an unrelated agency and unassigned school day',async()=>{
  User.getAgencies.mockResolvedValueOnce([{id:99}]);
  await expect(schoolWeeklyContext(request)).rejects.toMatchObject({status:403});
  pool.execute.mockResolvedValueOnce([[]]);
  await expect(schoolWeeklyContext(request)).rejects.toThrow('not assigned');
 });
 it('keeps booking paused and requires explicit school service location',async()=>{
  clientSessionBookingAccess.mockResolvedValueOnce({enabled:false,reason:'Not enabled'});
  expect(await schoolWeeklyContext(request)).toMatchObject({enabled:false,reason:'Not enabled',slots:[]});
  AgencyServiceLocation.findByAgencyAndSchool.mockResolvedValueOnce(null);
  expect(await schoolWeeklyContext(request)).toMatchObject({enabled:false,slots:[]});
 });
 it('excludes inactive services, add-ons and group-only codes even when staff-bookable and assigned',async()=>{
  StaffServiceAssignment.listServiceIdsForUser.mockResolvedValue([]);
  const base={isActive:true,isStaffBookable:true,allowsIndividual:true,modality:'EITHER'};
  TenantService.listForAgency.mockResolvedValue([
   {...base,id:1,serviceCode:'90834'},{...base,id:2,serviceCode:'90785'},
   {...base,id:3,serviceCode:'CUSTOM_ADDON'},{...base,id:4,serviceCode:'CUSTOM_INACTIVE'},
   {...base,id:5,serviceCode:'GROUP'},{...base,id:6,isActive:false,serviceCode:'H0031'}]);
  AgencyMedicalServiceCode.listByAgency.mockResolvedValue([
   {serviceCode:'CUSTOM_ADDON',isActive:true,isAddon:true},
   {serviceCode:'CUSTOM_INACTIVE',isActive:false},
   {serviceCode:'GROUP',isActive:true,sessionMode:'group'}]);
  const result=await schoolWeeklyContext(request);
  expect(result.services.map(row=>row.serviceCode)).toEqual(['90834']);
 });
});
