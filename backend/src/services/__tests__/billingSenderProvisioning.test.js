import {describe,it,expect,vi} from 'vitest';
import {billingSenderDefinition,billingSenderMembers,ensureBillingGroup} from '../familyLedger/senders.js';
const agency={id:2,name:'Practice',slug:'practice',organization_type:'agency',is_active:1,is_archived:0,feature_flags:{workspaceEmailDomain:'practice.invalid'}};
const args={email:'billing@practice.invalid',name:'Practice Billing',agencyId:2,groupId:'group',adoptExisting:true,members:['biller@manager.invalid'],transport:'ai@plottwistco.com'};
function directory(members=[]){return {
 getUser:vi.fn(async({primaryEmail})=>({id:primaryEmail,primaryEmail})),getGroup:vi.fn(async()=>({id:'group'})),
 listGroupMembers:vi.fn(async()=>members),createGroup:vi.fn(async()=>({id:'new'})),applyGroupAccessSettings:vi.fn(),addGroupMember:vi.fn(),
 setGroupMemberDeliverySettings:vi.fn(async()=>({delivery_settings:'ALL_MAIL'}))
};}
describe('practice billing and FundThred sender boundaries',()=>{
 it('keeps billing on the practice and FundThred under PlotTwistCo only',()=>{
  expect(billingSenderDefinition(agency).email).toBe('billing@practice.invalid');
  expect(()=>billingSenderDefinition(agency,'fundthred_collections')).toThrow();
  expect(billingSenderDefinition({...agency,id:1,slug:'plottwistco'},'fundthred_collections').email).toBe('collections@fundthred.com');
  expect(()=>billingSenderDefinition({...agency,organization_type:'school'})).toThrow();
  expect(()=>billingSenderDefinition({...agency,feature_flags:{billingAccountExcluded:true}})).toThrow();
 });
 it('accepts authorized managed billing staff only from configured organizational domains',async()=>{
  const db={execute:vi.fn(async()=>[[{id:1,work_email:'biller@manager.invalid'},{id:2,email:'outside@gmail.com'}]])};
  expect(await billingSenderMembers(2,'practice.invalid',{db,authorize:vi.fn(),managedDomains:['manager.invalid']})).toEqual(['biller@manager.invalid']);
 });
 it('resolves a practice alias to the managed biller’s canonical Workspace account',async()=>{
  const db={execute:vi.fn(async()=>[[{id:1,work_email:'biller@other-practice.invalid'}]])};
  expect(await billingSenderMembers(2,'practice.invalid',{db,authorize:vi.fn(),managedDomains:['manager.invalid'],resolveAddress:async()=> 'biller@manager.invalid'})).toEqual(['biller@manager.invalid']);
 });
 it('adds the relay as a member, verifies delivery, and preserves existing settings and owners',async()=>{
  const d=directory([{id:'biller@manager.invalid',email:'canonical@manager.invalid',type:'USER',role:'OWNER'}]);
  await ensureBillingGroup(args,{directory:d});
  expect(d.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'ai@plottwistco.com',role:'MEMBER'}));
  expect(d.setGroupMemberDeliverySettings).toHaveBeenCalledWith(expect.objectContaining({deliverySettings:'ALL_MAIL'}));
  expect(d.applyGroupAccessSettings).not.toHaveBeenCalled();
  expect(d.getGroup).toHaveBeenCalledWith(expect.objectContaining({strictNotFound:true}));
 });
 it('blocks unknown group members before making any changes',async()=>{
  const d=directory([{email:'support@manager.invalid',type:'USER',role:'MANAGER'}]);
  await expect(ensureBillingGroup(args,{directory:d})).rejects.toThrow('outside authorized');
  expect(d.addGroupMember).not.toHaveBeenCalled();expect(d.applyGroupAccessSettings).not.toHaveBeenCalled();
 });
 it('does not treat forbidden Directory access as a missing group',async()=>{
  const d=directory();d.getGroup.mockRejectedValue(Object.assign(new Error('Forbidden'),{code:403}));
  await expect(ensureBillingGroup(args,{directory:d})).rejects.toThrow('Forbidden');expect(d.createGroup).not.toHaveBeenCalled();
 });
 it('rejects suspended member identities',async()=>{
  const d=directory();d.getUser.mockResolvedValue({suspended:true});
  await expect(ensureBillingGroup(args,{directory:d})).rejects.toThrow('active managed');expect(d.addGroupMember).not.toHaveBeenCalled();
 });
 it('does not consider a sender ready without verified relay delivery',async()=>{
  const d=directory();d.setGroupMemberDeliverySettings.mockResolvedValue({delivery_settings:'NONE'});
  await expect(ensureBillingGroup(args,{directory:d})).rejects.toThrow('Confirm delivery');
 });
});
