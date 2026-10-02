import {describe,it,expect,vi,beforeEach} from 'vitest';
import pool from '../../config/database.js';
import {readProviderServices,saveProviderServices} from '../providerServiceOfferings.service.js';
import {offersProviderService,validateProviderServices} from '../../utils/providerServiceOfferings.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
const types=[{service_type:'counseling',display_name:'Counseling'},{service_type:'tutoring',display_name:'Tutoring'}];
let conn,person,enrollments;
beforeEach(()=>{
 vi.resetAllMocks();person={role:'admin',agency_role:'facilitator',is_active:1,membership_active:1,sees_clients:1,credential:'BA',status:'ACTIVE_EMPLOYEE',agency_name:'NLU',public_details_json:{serviceOfferingsByAgency:{'3':['tutoring']}}};enrollments=[];
 conn={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT service_type,display_name'))return [types];
  if(sql.startsWith('SELECT service_type,is_active'))return [enrollments];
  if(sql.includes('FROM users u JOIN user_agencies'))return [[person]];
  if(sql.startsWith('INSERT INTO provider_public_profiles')){person.public_details_json.serviceOfferingsByAgency={...person.public_details_json.serviceOfferingsByAgency,...JSON.parse(args[1]).serviceOfferingsByAgency};return [{}];}
  if(sql.startsWith('INSERT INTO provider_public_service_enrollments')) {enrollments.push({service_type:args[2],is_active:args[3]});return [{}];}
  if(sql.startsWith('SELECT id')||sql.startsWith('UPDATE provider_public_service_enrollments'))return [[]];
  throw Error(sql);
 }),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 pool.getConnection.mockResolvedValue(conn);pool.execute.mockImplementation(conn.execute);
});
describe('service offerings',()=>{
 it('does not offer or enroll services for a non-care employee with a degree',async()=>{
  person.agency_role='staff';person.credential='MA';enrollments=[{service_type:'counseling',is_active:1}];
  const result=await readProviderServices(9,2);expect(result.services.every(s=>!s.offered&&!s.onlineScheduling)).toBe(true);
  await expect(saveProviderServices(9,2,['counseling'])).rejects.toMatchObject({status:403});
  expect(conn.commit).not.toHaveBeenCalled();
 });
 it('enables online requests only for explicitly selected services in the current agency',async()=>{
  const result=await saveProviderServices(9,2,['counseling','tutoring'],['counseling']);
  expect(result.services.map(s=>s.onlineScheduling)).toEqual([true,false]);
  expect(conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO provider_public_service_enrollments')).map(([,args])=>args)).toEqual([[2,9,'counseling',1],[2,9,'tutoring',0]]);
 });
 it('rejects online scheduling for services the provider does not offer',async()=>{await expect(saveProviderServices(9,2,['counseling'],['tutoring'])).rejects.toMatchObject({status:400});expect(conn.commit).not.toHaveBeenCalled();});
 it('preserves legacy counseling discovery and active service enrollments',()=>{
  expect(offersProviderService({},2,'counseling',{counselingEligible:true})).toBe(true);
  expect(offersProviderService({},2,'tutoring',{counselingEligible:true})).toBe(false);
  expect(offersProviderService({},2,'tutoring',{enrolled:true})).toBe(true);
  expect(offersProviderService({},2,'counseling',{hasEnrollment:true,counselingEligible:true})).toBe(false);
 });
 it('supports multiple services with explicit opt-outs and agency isolation',()=>{
  const d={serviceOfferingsByAgency:{'2':['counseling','tutoring'],'3':[]}};
  expect(offersProviderService(JSON.stringify(d),2,'tutoring')).toBe(true);
  expect(offersProviderService(d,2,'counseling')).toBe(true);
  expect(offersProviderService(d,3,'counseling',{counselingEligible:true,enrolled:true})).toBe(false);
  expect(offersProviderService(d,4,'tutoring')).toBe(false);
 });
 it('reads enrollment defaults alongside the correct agency name',async()=>{
  enrollments=[{service_type:'tutoring',is_active:1}];
  const result=await readProviderServices(9,2);expect(result.agencyName).toBe('NLU');expect(result.services.map(s=>s.offered)).toEqual([true,true]);
 });
 it('saves both services without enabling booking or losing another agency',async()=>{
  const result=await saveProviderServices(9,2,['counseling','tutoring']);
  expect(result.services.map(s=>s.offered)).toEqual([true,true]);expect(result.services.every(s=>!s.onlineScheduling)).toBe(true);
  expect(person.public_details_json.serviceOfferingsByAgency['3']).toEqual(['tutoring']);
  expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE provider_public_service_enrollments'))).toBe(false);
  expect(conn.commit).toHaveBeenCalledOnce();expect(conn.release).toHaveBeenCalledOnce();
 });
 it('turns off booking only for services removed from this agency',async()=>{
  await saveProviderServices(9,2,['counseling']);
  expect(conn.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE provider_public_service_enrollments')).map(([,args])=>args)).toEqual([[9,2,'tutoring']]);
 });
 it('rejects disabled services and rolls back without saving',async()=>{
  await expect(saveProviderServices(9,2,['unknown'])).rejects.toMatchObject({status:400});expect(conn.rollback).toHaveBeenCalledOnce();expect(conn.commit).not.toHaveBeenCalled();
  expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  expect(()=>validateProviderServices('tutoring',['tutoring'])).toThrow();
 });
});
