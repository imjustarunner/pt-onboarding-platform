import {describe,it,expect,vi,beforeEach} from 'vitest';
import pool from '../../config/database.js';
import Availability from '../../services/providerAvailability.service.js';
import {listTutors,listCounselors,createBookingRequest} from '../publicAgencyServices.controller.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/providerAvailability.service.js',()=>({default:{computeWeekAvailability:vi.fn()}}));
vi.mock('../../models/PublicAppointmentRequest.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:async()=>({}),getAgencySettings:async()=>({})}}));
vi.mock('../../services/publicCounselingRate.service.js',()=>({getPublicCounselingHourlyRate:async()=>null}));
vi.mock('../../services/publicProviderHold.service.js',()=>({createPublicProviderHoldService:()=>({}),holdError:vi.fn()}));
vi.mock('../../services/publicIntakeClient.service.js',()=>({default:{},PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS:{},isPractitionerOrgType:()=>false,resolveOrganizationIdForPublicBooking:vi.fn()}));
vi.mock('../../services/email.service.js',()=>({default:{}}));
vi.mock('../../services/officeIntakeProviders.service.js',()=>({listOfficeIntakeProviders:vi.fn()}));
vi.mock('../../services/adaptiveIntake.service.js',()=>({findFullIntakePublicKey:vi.fn()}));
vi.mock('../../services/providerClinicalFacets.service.js',()=>({listClinicalFacetsForUser:async()=>({specialties:[],modalities:[],ageGroups:[],focus:[]})}));
vi.mock('../../services/providerAcceptedInsurance.service.js',()=>({listProviderAcceptedInsurancesForDisplay:async()=>[]}));
let selected,active;
const request=()=>({params:{agencySlug:'test'},query:{view:'directory'},body:{providerId:9,serviceType:'tutoring'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
 vi.clearAllMocks();selected=['tutoring','counseling'];active=false;
 pool.execute.mockImplementation(async sql=>{
  const person={id:9,first_name:'Example',last_name:'Provider',role:'admin',provider_accepting_new_clients:1,service_details:{serviceOfferingsByAgency:{'2':selected}},online_enrolled:0,has_enrollment:0};
  if(sql.includes('FROM agencies'))return [[{id:2,slug:'test',name:'Example agency',public_availability_enabled:1}]];
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
});
