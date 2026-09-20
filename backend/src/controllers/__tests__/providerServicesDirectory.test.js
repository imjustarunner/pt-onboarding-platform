import {describe,it,expect,vi,beforeEach} from 'vitest';
import pool from '../../config/database.js';
import Availability from '../../services/providerAvailability.service.js';
import {listTutors,listCounselors,createBookingRequest,joinProviderWaitlist,getProviderScheduleSummary} from '../publicAgencyServices.controller.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
import {createPublicAgencySupportTicket} from '../../services/publicAgencySupport.service.js';
import {readPublicProviderSchedule} from '../../services/publicProviderSchedule.service.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/providerAvailability.service.js',()=>({default:{computeWeekAvailability:vi.fn()}}));
vi.mock('../../models/PublicAppointmentRequest.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn(async()=>({})),getAgencySettings:async()=>({})}}));
vi.mock('../../services/publicAgencySupport.service.js',()=>({createPublicAgencySupportTicket:vi.fn(async()=>({ok:true,ticketId:123}))}));
vi.mock('../../services/publicProviderSchedule.service.js',()=>({readPublicProviderSchedule:vi.fn(async()=>({slots:[],waitlistEnabled:true}))}));
vi.mock('../../services/publicCounselingRate.service.js',()=>({getPublicCounselingHourlyRate:async()=>null}));
vi.mock('../../services/publicProviderHold.service.js',()=>({createPublicProviderHoldService:()=>({}),holdError:vi.fn()}));
vi.mock('../../services/publicIntakeClient.service.js',()=>({default:{},PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS:{},isPractitionerOrgType:()=>false,resolveOrganizationIdForPublicBooking:vi.fn()}));
vi.mock('../../services/email.service.js',()=>({default:{}}));
vi.mock('../../services/officeIntakeProviders.service.js',()=>({listOfficeIntakeProviders:vi.fn()}));
vi.mock('../../services/adaptiveIntake.service.js',()=>({findFullIntakePublicKey:vi.fn()}));
vi.mock('../../services/providerClinicalFacets.service.js',()=>({listClinicalFacetsForUser:async()=>({specialties:[],modalities:[],ageGroups:[],focus:[]})}));
vi.mock('../../services/providerAcceptedInsurance.service.js',()=>({listProviderAcceptedInsurancesForDisplay:async()=>[]}));
let selected,active,bookingEnabled;
const request=()=>({params:{agencySlug:'test'},query:{view:'directory'},body:{providerId:9,serviceType:'tutoring'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
 vi.clearAllMocks();selected=['tutoring','counseling'];active=false;bookingEnabled=true;Profile.getForProvider.mockResolvedValue({});
 pool.execute.mockImplementation(async sql=>{
  const person={id:9,first_name:'Example',last_name:'Provider',role:'admin',provider_accepting_new_clients:1,service_details:{serviceOfferingsByAgency:{'2':selected}},online_enrolled:0,has_enrollment:0};
  if(sql.includes('FROM agencies'))return [[{id:2,slug:'test',name:'Example agency',public_availability_enabled:bookingEnabled?1:0}]];
  if(sql.includes('FROM agency_public_service_types'))return [[{service_type:'tutoring'},{service_type:'counseling'}]];
  if(sql.includes('JOIN provider_public_service_enrollments e'))return [active?[{...person,online_enrolled:1}]:[]];
  if(sql.includes('FROM users u JOIN user_agencies'))return [[person]];
  if(sql.includes('FROM provider_tutoring_profiles')||sql.includes('FROM agency_learning_catalogs'))return [[]];
  throw Error('Unexpected query: '+sql);
 });
});
describe('public multi-service directories',()=>{
 it('lists an explicitly selected provider in both directories without tutoring pricing or booking',async()=>{
  const next=vi.fn();const tutoring=response();await listTutors(request(),tutoring,next);expect(next).not.toHaveBeenCalled();
  const tutor=tutoring.json.mock.calls[0][0].providers[0];expect(tutor.providerId).toBe(9);expect(tutor.onlineScheduling).toBe(false);expect(tutor.tutoringProfile.hourlyRateCents).toBeNull();expect(tutor.availability.slots).toEqual([]);
  const counseling=response();await listCounselors(request(),counseling,next);expect(next).not.toHaveBeenCalled();expect(counseling.json.mock.calls[0][0].providers.map(p=>p.providerId)).toEqual([9]);
  expect(Availability.computeWeekAvailability).not.toHaveBeenCalled();
 });
 it('does not list a service merely because the provider offers another',async()=>{
  selected=['counseling'];const res=response(),next=vi.fn();await listTutors(request(),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].providers).toEqual([]);
 });
 it('honors explicit removal even with an old active enrollment',async()=>{
  active=true;selected=[];const res=response(),next=vi.fn();await listTutors(request(),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].providers).toEqual([]);
 });
 it('rejects a booking for a directory-only provider',async()=>{
  const res=response(),next=vi.fn();await createBookingRequest(request(),res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(400);expect(res.json).toHaveBeenCalledWith({error:{message:'Provider is not enrolled in this service'}});
 });
 it('allows directory and schedule information when online booking is disabled, but keeps bookings disabled',async()=>{
  bookingEnabled=false;const res=response(),next=vi.fn();await listCounselors(request(),res,next);
  expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].providers).toHaveLength(1);
  const schedule=response();await getProviderScheduleSummary({...request(),params:{agencySlug:'test',providerId:'9'}},schedule,next);
  expect(schedule.json).toHaveBeenCalledWith(expect.objectContaining({onlineScheduling:false}));
  const booking=response();await createBookingRequest(request(),booking,next);expect(booking.status).toHaveBeenCalledWith(403);
 });
 it('requires an explicit waitlist and a provider published for the selected agency and service',async()=>{
  const req={...request(),params:{agencySlug:'test',providerId:'9'},body:{serviceType:'counseling',format:'VIRTUAL',name:'Visitor',email:'visitor@example.test'}};
  const closed=response(),next=vi.fn();await joinProviderWaitlist(req,closed,next);expect(closed.status).toHaveBeenCalledWith(409);expect(createPublicAgencySupportTicket).not.toHaveBeenCalled();
  Profile.getForProvider.mockResolvedValue({details:{waitlistEnabled:true}});
  const missing=response();await joinProviderWaitlist({...req,params:{agencySlug:'test',providerId:'99'}},missing,next);expect(missing.status).toHaveBeenCalledWith(404);
  const valid=response();await joinProviderWaitlist(req,valid,next);expect(next).not.toHaveBeenCalled();expect(valid.status).toHaveBeenCalledWith(201);
  expect(createPublicAgencySupportTicket).toHaveBeenCalledWith('test',expect.objectContaining({email:'visitor@example.test',category:'provider'}),req,{providerWaitlist:{providerId:9,serviceType:'counseling',format:'VIRTUAL',providerName:'Example Provider'}});
 });
 it('a format-specific waitlist does not authorize another format',async()=>{
  Profile.getForProvider.mockResolvedValue({details:{officeAvailability:'waitlist'}});
  const res=response(),next=vi.fn();await joinProviderWaitlist({...request(),params:{agencySlug:'test',providerId:'9'},body:{serviceType:'counseling',format:'VIRTUAL'}},res,next);
  expect(res.status).toHaveBeenCalledWith(409);expect(createPublicAgencySupportTicket).not.toHaveBeenCalled();
 });
});
