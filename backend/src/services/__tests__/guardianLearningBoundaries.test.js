import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listClientsForGuardian:vi.fn(),isNoView:permissions=>!!permissions?.noView}}));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {linkAllowsBillingView,linkAllowsBilling,linkAllowsInsurance,requireBillingLink,requireInsuranceLink} from '../familyBillingPolicy.service.js';
import {effectiveClinicalAccess} from '../guardianClinicalAccess.service.js';
import {guardianCareContexts,guardianServiceContext,guardianContextAllowsAppointment} from '../clientServiceEnrollment.service.js';
import {authorizedAppointmentClient,requireGuardianCancellation} from '../guardianAppointments.service.js';

let link,services;
beforeEach(()=>{
 vi.clearAllMocks();
 link={client_id:2545,agency_id:453,client_type:'learning',access_enabled:1,guardian_portal_enabled:1,relationship_type:'guardian',date_of_birth:'2016-04-12',permissions_json:{learningOnly:true,serviceKinds:['tutoring'],serviceAgencyIds:[453],noView:false,canMessage:true,canViewDocs:false,canSignDocs:false,canViewProgress:false}};
 services=[{id:1,client_id:2545,agency_id:453,service_kind:'tutoring',provider_user_id:1496,is_active:1},{id:2,client_id:2545,agency_id:453,service_kind:'counseling',provider_user_id:1439,is_active:1},{id:3,client_id:2545,agency_id:6,service_kind:'tutoring',provider_user_id:9,is_active:1}];
 ClientGuardian.listClientsForGuardian.mockImplementation(async()=>[link]);
 pool.execute.mockImplementation(async(sql)=>{
  if(sql.includes('FROM client_guardians cg'))return [[link]];
  if(sql.includes('SELECT DISTINCT a.id AS agency_id'))return [[{agency_id:453,agency_name:'QA Learning'},{agency_id:6,agency_name:'Other learning'}]];
  if(sql.includes('FROM client_service_enrollments'))return [[...services]];
  if(sql.includes('SELECT c.id'))return [[{id:2545}]];
  if(sql.includes('FROM appointment_participants'))return [[{clientId:2545}]];
  throw Error('Unexpected query in guardian scope test');
 });
});
describe('durable learning-only guardian permissions',()=>{
 it('denies billing and insurance at the server policy even when independent support scopes later exist',async()=>{
  for(const candidate of [link,{...link,independence_status:'active',support_scopes:['billing','insurance']}]){
   expect(linkAllowsBillingView(candidate)).toBe(false);expect(linkAllowsBilling(candidate)).toBe(false);expect(linkAllowsInsurance(candidate)).toBe(false);
  }
  await expect(requireBillingLink(1760,2545,453)).rejects.toMatchObject({status:403});await expect(requireInsuranceLink(1760,2545,453)).rejects.toMatchObject({status:403});
 });
 it('does not inherit medical disclosure from a later clinical grant',()=>{
  const grant={medical_rights_verified:1,access_level:'full',consent_basis:'legal_representative',scopes_json:['clinical_messages','clinical_documents','treatment_plan']};
  expect(effectiveClinicalAccess({link,grant,dob:link.date_of_birth,asOf:'2026-11-12'}).scopes).toEqual([]);
  expect(effectiveClinicalAccess({link:{...link,permissions_json:{}},grant,dob:link.date_of_birth,asOf:'2026-11-12'}).scopes).toContain('clinical_documents');
 });
 it('returns only the original agency tutoring context after another clinical and another agency service are added',async()=>{
  const contexts=await guardianCareContexts(link,1760);expect(contexts).toHaveLength(1);expect(contexts[0].agency_id).toBe(453);expect(contexts[0].services.map(service=>service.id)).toEqual([1]);
  await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:453,serviceId:1})).resolves.toMatchObject({client_type:'learning',service:{id:1}});
  await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:453,serviceId:2,scope:null})).rejects.toMatchObject({status:403});
  await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:6,serviceId:3,scope:null})).rejects.toMatchObject({status:403});
 });
 it('keeps unscoped appointment access limited to current tutoring and denies a clinical cancellation',async()=>{
  const context=await authorizedAppointmentClient(1760,2545);
  expect(context.authorizedServices.map(service=>service.id)).toEqual([1]);
  expect(guardianContextAllowsAppointment(context,{agencyId:453,providerUserId:1496,businessType:'learning'})).toBe(true);
  expect(guardianContextAllowsAppointment(context,{agencyId:453,providerUserId:1439,businessType:'mental_health'})).toBe(false);
  await expect(requireGuardianCancellation({userId:1760,clientId:2545,appointment:{id:7,agencyId:453,providerUserId:1439,businessType:'mental_health'}})).rejects.toMatchObject({status:403});
 });
 it('revocation or ending the authorized learning service cannot fall back to clinical access',async()=>{
  link.permissions_json.noView=true;await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:453,scope:null})).rejects.toMatchObject({status:403});
  link.permissions_json.noView=false;services[0].is_active=0;await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:453,scope:null})).rejects.toMatchObject({status:403});
 });
 it('preserves the exact selected tutoring provider even when another tutoring service is authorized',async()=>{
  services.push({id:4,client_id:2545,agency_id:453,service_kind:'tutoring',provider_user_id:1500,is_active:1});
  const selected=await guardianServiceContext({userId:1760,clientId:2545,agencyId:453,serviceId:1,scope:null});
  expect(guardianContextAllowsAppointment(selected,{agencyId:453,providerUserId:1496,businessType:'learning'})).toBe(true);
  expect(guardianContextAllowsAppointment(selected,{agencyId:453,providerUserId:1500,businessType:'learning'})).toBe(false);
 });
 it.each(['{','null','[]','false',false,0])('fails closed on malformed or nonobject permission data %s',async permissions=>{
  link.permissions_json=permissions;
  expect(linkAllowsBilling(link)).toBe(false);expect(linkAllowsInsurance(link)).toBe(false);
  await expect(guardianServiceContext({userId:1760,clientId:2545,agencyId:453,serviceId:1,scope:null})).rejects.toMatchObject({status:403});
 });
 it('preserves the prior billing and dual-service behavior of ordinary unrestricted guardian links',async()=>{
  link.permissions_json={};expect(linkAllowsBilling(link)).toBe(true);expect(linkAllowsInsurance(link)).toBe(true);
  const contexts=await guardianCareContexts(link,1760);expect(contexts).toHaveLength(2);expect(contexts[0].services.map(service=>service.id)).toEqual([1,2]);
 });
});
