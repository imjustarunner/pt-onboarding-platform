import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn(async(_uid,_aid,db)=>({role:db.scopedRole||'provider'}))}));
import pool from '../../config/database.js';
import {childcareContext,saveChildcareGrant,normalizeChildcareShift,createChildcareShift} from '../childcare.service.js';
const active={id:7,role:'provider',is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE',membership_active:1};
function dbFor({user=active,grant={enabled:1,self_schedule:1},agency={id:453,slug:'nlu-qa-demo',feature_flags:{},is_active:1}}={}) {
 return {scopedRole:user.role,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>{
  if(sql.startsWith('SELECT id,slug,name'))return [[agency]];
  if(sql.includes('SELECT u.*,ua.is_active'))return [[user]];
  if(sql.startsWith('SELECT enabled,self_schedule'))return [grant?[grant]:[]];
  if(sql.startsWith('SELECT id FROM users'))return [[{id:user.id}]];
  throw new Error(`Unexpected SQL: ${sql}`);
 })};
}
beforeEach(()=>vi.resetAllMocks());
describe('childcare agency and employee service permissions',()=>{
 it('authorizes self-scheduling solely from the explicit grant',async()=>{
  expect(await childcareContext({agencyId:453,userId:7},dbFor())).toMatchObject({canWork:true,canSchedule:true,canManage:false,serviceRoles:['childcare']});
  expect(await childcareContext({agencyId:453,userId:7},dbFor({grant:null}))).toMatchObject({canWork:false,canSchedule:false});
 });
 it('rejects pending employees, parents, inactive memberships and unrelated agency scopes',async()=>{
  for(const user of [{...active,status:'PREHIRE_OPEN'},{...active,role:'client_guardian'},{...active,membership_active:0},{...active,is_active:0}])await expect(childcareContext({agencyId:453,userId:7},dbFor({user}))).rejects.toMatchObject({status:403});
  await expect(childcareContext({agencyId:450,userId:7},dbFor({agency:{id:450,slug:'auricwell-qa-demo'}}))).rejects.toMatchObject({status:403});
  await expect(childcareContext({agencyId:455,userId:7},dbFor({agency:{id:455,slug:'nlu-qa-demo'}}))).rejects.toMatchObject({status:403});
 });
 it('lets an explicit childcare scheduler coordinate without granting pay or permission administration',async()=>{
  expect(await childcareContext({agencyId:453,userId:7},dbFor({grant:{enabled:1,manage_schedule:1}}))).toMatchObject({canWork:true,canManage:true,canSchedule:true,canManagePay:false,canManagePermissions:false});
  expect(await childcareContext({agencyId:453,userId:7},dbFor({grant:{enabled:0,manage_schedule:1}}))).toMatchObject({canWork:false,canManage:false,canSchedule:false});
 });
 it('does not regain global administrator powers after an agency role was reduced',async()=>{
  const db=dbFor({user:{...active,role:'admin'}});db.scopedRole='provider';
  expect(await childcareContext({agencyId:453,userId:7},db)).toMatchObject({canManage:false,canManagePermissions:false,canManagePay:false});
 });
 it('does not let a caregiver or scheduler grant their own additional powers',async()=>{
  const db=dbFor({grant:{enabled:1,manage_schedule:1}});pool.getConnection.mockResolvedValue(db);
  await expect(saveChildcareGrant({agencyId:453,userId:7,targetUserId:7,enabled:true,manageSchedule:true})).rejects.toMatchObject({status:403});
  expect(db.rollback).toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('rejects assigning somebody else through self scheduling before any event write',async()=>{
  const db=dbFor();pool.getConnection.mockResolvedValue(db);
  await expect(createChildcareShift({agencyId:453,userId:7,plannedChildren:3,providerUserIds:[8],startsAt:'2026-11-19T16:00:00-07:00',endsAt:'2026-11-19T19:00:00-07:00'})).rejects.toMatchObject({status:403});
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('requires exact zoned schedule times and an aggregate count without child identities',()=>{
  const valid={startsAt:'2026-11-19T16:00:00-07:00',endsAt:'2026-11-19T19:00:00-07:00',plannedChildren:3,providerUserIds:[7]};
  expect(normalizeChildcareShift(valid)).toMatchObject({startsAt:'2026-11-19T23:00:00.000Z',plannedChildren:3,providerUserIds:[7]});
  for(const patch of [{startsAt:'2026-11-19T16:00'},{plannedChildren:-1},{plannedChildren:1.2},{providerUserIds:[]},{timezone:'made/up'}])expect(()=>normalizeChildcareShift({...valid,...patch})).toThrow();
 });
});
