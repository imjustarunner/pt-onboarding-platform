vi.mock('../sharedCareNumber.service.js',()=>({sharedCareNumberId:vi.fn(),getSharedCareNumber:vi.fn()}));
import {sharedCareNumberId,getSharedCareNumber} from '../sharedCareNumber.service.js';
import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn().mockResolvedValue({})}}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{findByPhoneNumber:vi.fn()}}));
vi.mock('../../models/PhoneNumberAssignment.model.js',()=>({default:{listByNumberId:vi.fn(),listEligibleUserIdsForNumber:vi.fn()}}));
vi.mock('../../models/UserPreferences.model.js',()=>({default:{}}));
vi.mock('../availabilityWindow.service.js',()=>({isUserAvailable:vi.fn()}));
vi.mock('../vacationScheduleSync.service.js',()=>({default:{isUserOnVacation:vi.fn()}}));
vi.mock('../smsProfileAudit.service.js',()=>({normalizeNumberPurpose:x=>x,skipsClinicalInbox:()=>false,resolveProfilePhoneMatch:vi.fn()}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Client from '../../models/Client.model.js';
import PhoneNumber from '../../models/PhoneNumber.model.js';
import PhoneNumberAssignment from '../../models/PhoneNumberAssignment.model.js';
import {isUserAvailable} from '../availabilityWindow.service.js';
import Vacation from '../vacationScheduleSync.service.js';
import {resolveProfilePhoneMatch} from '../smsProfileAudit.service.js';
import {resolveInboundRoute,resolveOutboundNumber} from '../communicationRouting.service.js';
beforeEach(()=>{
 vi.clearAllMocks();sharedCareNumberId.mockResolvedValue(null);getSharedCareNumber.mockResolvedValue(null);
 PhoneNumber.findByPhoneNumber.mockResolvedValue({id:1,agency_id:2,number_purpose:'clinical_care'});
 PhoneNumberAssignment.listByNumberId.mockResolvedValue([{user_id:10}]);
 PhoneNumberAssignment.listEligibleUserIdsForNumber.mockResolvedValue([10]);
 resolveProfilePhoneMatch.mockResolvedValue({clientId:4,clients:[{id:4,agency_id:2}]});
 User.findById.mockResolvedValue({id:10,role:'provider',is_active:1,status:'ACTIVE_EMPLOYEE'});
 pool.execute.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT provider_user_id')) return [[{provider_user_id:10,is_primary:1}]];
   if(sql.includes('SELECT u.* FROM users')) return [[{id:10,is_active:1,status:'ACTIVE_EMPLOYEE'}]];
   if(sql.includes("u.role IN ('support'")) return [[{id:20}]];
   return [[]];
 });
 isUserAvailable.mockResolvedValue({available:true});Vacation.isUserOnVacation.mockResolvedValue(false);
});
describe('provider communication coverage',()=>{
 it('routes available clinicians to their own client',async()=>{expect(await resolveInboundRoute({toNumber:'x',fromNumber:'y'})).toMatchObject({careOwnerUserId:10,eligibleUserIds:[10],coverageReason:null});});
 it('routes after-hours notifications to support without changing care ownership',async()=>{isUserAvailable.mockResolvedValue({available:false});expect(await resolveInboundRoute({toNumber:'x',fromNumber:'y'})).toMatchObject({careOwnerUserId:10,eligibleUserIds:[20],coverageReason:'outside_work_hours',supportAccess:'respond'});expect(isUserAvailable).toHaveBeenCalledWith(10,expect.any(Date),{agencyId:2});});
 it('routes vacation to support even within work hours',async()=>{Vacation.isUserOnVacation.mockResolvedValue(true);expect(await resolveInboundRoute({toNumber:'x',fromNumber:'y'})).toMatchObject({eligibleUserIds:[20],coverageReason:'provider_away'});});
 it('rejects outbound use by a terminated provider',async()=>{User.findById.mockResolvedValue({id:10,status:'TERMINATED_PENDING'});expect(await resolveOutboundNumber({userId:10})).toEqual({error:'staff_unavailable'});});
});

describe('shared care line assignment',()=>{
 it('does not give an unassigned client to the first provider in the phone pool',async()=>{
  sharedCareNumberId.mockResolvedValue(1);
  pool.execute.mockImplementation(async sql=>{
   if(sql.includes('SELECT provider_user_id'))return [[]];
   if(sql.includes('SELECT u.* FROM users'))return [[{id:10,is_active:1,status:'ACTIVE_EMPLOYEE'}]];
   if(sql.includes("u.role IN ('support'"))return [[{id:20}]];
   return [[]];
  });
  Client.findById.mockResolvedValue({id:4,agency_id:2});
  User.findById.mockImplementation(async id=>({id,role:id===20?'support':'provider',is_active:1,status:'ACTIVE_EMPLOYEE'}));
  expect(await resolveInboundRoute({toNumber:'x',fromNumber:'y'})).toMatchObject({ownerType:'agency',eligibleUserIds:[20],supportAccess:'respond'});
 });
 it('defaults client replies to the selected shared care number',async()=>{
  Client.findById.mockResolvedValue({id:4,agency_id:2});getSharedCareNumber.mockResolvedValue({id:1,agency_id:2});
  expect(await resolveOutboundNumber({userId:10,clientId:4})).toMatchObject({number:{id:1},ownerType:'agency',assignment:null});
 });
});
