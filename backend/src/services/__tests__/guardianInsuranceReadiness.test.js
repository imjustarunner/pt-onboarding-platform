import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/GuardianInsuranceProfile.model.js',()=>({default:{findByGuardian:vi.fn(),upsert:vi.fn()},decodeInsuranceProfile:row=>row}));
vi.mock('../../models/GuardianPaymentCard.model.js',()=>({default:{findActiveByGuardian:vi.fn()},paymentCardSummary:value=>value}));
vi.mock('../storage.service.js',()=>({default:{}}));
vi.mock('../documentEncryption.service.js',()=>({default:{}}));
vi.mock('../stripePayments.service.js',()=>({getStripePublishableKey:()=>null}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),normalizePolicy:v=>v,claimInsuranceIssues:()=>[],applySubmittedClientInsurance:vi.fn()}));
import pool from '../../config/database.js';
import Profiles from '../../models/GuardianInsuranceProfile.model.js';
import Cards from '../../models/GuardianPaymentCard.model.js';
import {readClientInsurance,applySubmittedClientInsurance} from '../clientInsurance.service.js';
import {getFamilyBillingSummary,saveFamilyInsurance} from '../familyBilling.service.js';
import {cardContext} from '../insuranceCards/service.js';

beforeEach(()=>vi.clearAllMocks());
describe('second guardian insurance readiness',()=>{
 it('allows the policy holder to upload an explicitly linked additional policy before coverage coordination',async()=>{
  const profile={id:22,agency_id:1,guardian_user_id:20,client_id:101,primary:{insurerName:'Other coverage',memberId:'SYNTHETIC'}};
  pool.execute.mockImplementation(async sql=>{
   if(sql.includes('SELECT p.*'))return [[profile]];
   if(sql.includes('SELECT DISTINCT c.id'))return [[{id:101,assigned_profile_id:22}]];
   if(sql.includes('SELECT cg.*'))return [[{access_enabled:1,relationship_type:'guardian'}]];
   throw Error(sql);
  });
  readClientInsurance.mockResolvedValue({profileId:11,primary:{insurerName:'First coverage'}});
  expect((await cardContext({agencyId:1,profileId:22,userId:20})).clients).toHaveLength(1);
  await expect(cardContext({agencyId:1,profileId:22,userId:10})).rejects.toMatchObject({status:404});
  pool.execute.mockImplementation(async sql=>sql.includes('SELECT p.*')?[[profile]]:sql.includes('SELECT DISTINCT c.id')?[[{id:101}]]:[[{access_enabled:1,relationship_type:'guardian'}]]);
  await expect(cardContext({agencyId:1,profileId:22,userId:20})).rejects.toMatchObject({status:404});
 });
 it('keeps card uploads unavailable after the guardian link is restricted',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('SELECT p.*')?[[{id:22,guardian_user_id:20,client_id:101}]]:sql.includes('SELECT DISTINCT c.id')?[[{id:101,assigned_profile_id:22}]]:[[{access_enabled:1,relationship_type:'guardian',permissions_json:{noView:true}}]]);
  await expect(cardContext({agencyId:1,profileId:22,userId:20})).rejects.toMatchObject({status:404});
  expect(readClientInsurance).not.toHaveBeenCalled();
 });
 it('shows insurance on file and only owned policies without requiring payment liability',async()=>{
  pool.execute.mockImplementation(async sql=>{
   if(sql.includes('SELECT c.id'))return [[{id:101,full_name:'Synthetic child',access_enabled:1,relationship_type:'guardian',insurance_on_file:1}]];
   if(sql.includes('SELECT p.guardian_user_id'))return [[{guardian_user_id:10,first_name:'Other',last_name:'Parent'}]];
   if(sql.includes('SELECT client_id'))return [[{client_id:101}]];
   return [[]];
  });
  Profiles.findByGuardian.mockResolvedValue([{id:22,client_id:101,primary:{insurerName:'Own coverage'}}]);
  const result=await getFamilyBillingSummary(20,1);
  expect(result.clients[0]).toMatchObject({insuranceOnFile:true,canManageInsurance:true,canManageBilling:false});
  expect(result.profiles).toHaveLength(1);expect(result.cards).toEqual([]);expect(Cards.findActiveByGuardian).not.toHaveBeenCalled();
  expect(Profiles.findByGuardian).toHaveBeenCalledWith(20,1);
 });
 it('does not expose a client or payer names through a no-view invitation link',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('SELECT c.id')?[[{id:101,full_name:'Hidden child',access_enabled:1,permissions_json:{noView:true}}]]:[[]]);
  const result=await getFamilyBillingSummary(20,1);expect(result.clients).toEqual([]);expect(result.profiles).toEqual([]);
  expect(pool.execute.mock.calls.some(([sql])=>sql.includes('SELECT p.guardian_user_id'))).toBe(false);
 });
 it('accepts additional coverage without creating payer liability or overwriting the existing policy',async()=>{
  const execute=vi.fn(async sql=>sql.includes('SELECT cg.*')?[[{access_enabled:1,relationship_type:'guardian'}]]:[{insertId:1}]);
  const db={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.execute.mockImplementation(execute);pool.getConnection.mockResolvedValue(db);
  Profiles.upsert.mockResolvedValue(22);applySubmittedClientInsurance.mockResolvedValue(false);
  const primary={insurerName:'Second coverage',memberId:'SYNTHETIC',subscriberName:'Parent Two',relationshipToSubscriber:'child'};
  expect(await saveFamilyInsurance({userId:20,agencyId:1,clientIds:[101],coverageConfirmed:true,coverageScope:'client',primary})).toBe(22);
  expect(execute.mock.calls.some(([sql])=>sql.includes('client_billing_payers'))).toBe(false);
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({clientId:101,profileId:22,confirmedBy:20}),db);
  expect(db.commit).toHaveBeenCalled();
 });
});
