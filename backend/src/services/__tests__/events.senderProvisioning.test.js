import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{}}));
import { provisionCompanyEventEmailSenders } from '../companyEventEmailProvisioning.service.js';
const agency={id:2,name:'ITSCO',slug:'itsco',organization_type:'agency',is_active:1,feature_flags:{workspaceEmailDomain:'itsco.health',managedWorkspaceGroupsEnabled:true}};
const env={WORKSPACE_EMAIL_RELAY_MODE:'domains',WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED:'true',WORKSPACE_EMAIL_RELAY_DOMAINS:'itsco.health',WORKSPACE_EMAIL_RELAY_URL:'https://mail-relay-123.run.app'};
const fixtures=()=>({
  db:{execute:vi.fn().mockResolvedValue([[agency]])},env,
  identities:{findByAgencyAndIdentityKey:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:42}),replaceInboundRoutes:vi.fn()},
  directory:{getGroup:vi.fn().mockResolvedValue(null),createGroup:vi.fn().mockResolvedValue({id:'group-1'}),applyGroupAccessSettings:vi.fn(),addGroupMember:vi.fn().mockImplementation(async ({memberEmail,role})=>({email:memberEmail,role,delivery_settings:role==='OWNER'?'NONE':'ALL_MAIL'})),listGroupMembers:vi.fn().mockResolvedValue([
    {email:'michael@plottwistco.com',role:'OWNER',delivery_settings:'NONE'}, {email:'ai@plottwistco.com',role:'MANAGER',delivery_settings:'ALL_MAIL'}])},
  verify:vi.fn().mockResolvedValue({transport:'workspace_smtp_relay'}),inboxes:{ensureFromSenderIdentities:vi.fn()}
});
beforeEach(()=>vi.clearAllMocks());
describe('event sender provisioning',()=>{
  it('defaults to a nonmutating plan',async()=>{
    const deps=fixtures();expect(await provisionCompanyEventEmailSenders(deps)).toMatchObject([{status:'ready_to_provision',email:'events@itsco.health'}]);
    expect(deps.directory.createGroup).not.toHaveBeenCalled();expect(deps.identities.create).not.toHaveBeenCalled();
  });
  it('uses the existing Group ownership, inbound routing and approved relay',async()=>{
    const deps=fixtures();expect(await provisionCompanyEventEmailSenders({...deps,apply:true})).toMatchObject([{status:'ready',identityId:42}]);
    expect(deps.directory.createGroup).toHaveBeenCalledWith(expect.objectContaining({email:'events@itsco.health',allowExternalMembers:false}));
    expect(deps.identities.create).toHaveBeenCalledWith(expect.objectContaining({identityKey:'events',fromEmail:'events@itsco.health',replyTo:'events@itsco.health'}));
    expect(deps.verify).toHaveBeenCalled();expect(deps.inboxes.ensureFromSenderIdentities).toHaveBeenCalledWith(2);
  });
  it('preserves deliberately disabled identities',async()=>{
    const deps=fixtures();deps.identities.findByAgencyAndIdentityKey.mockResolvedValue({id:42,is_active:0});
    expect(await provisionCompanyEventEmailSenders({...deps,apply:true})).toMatchObject([{status:'disabled_identity_preserved'}]);
    expect(deps.directory.getGroup).not.toHaveBeenCalled();expect(deps.identities.create).not.toHaveBeenCalled();
  });
  it('never creates a Gmail alias or turns on a new relay domain',async()=>{
    const deps=fixtures();deps.env={...env,WORKSPACE_EMAIL_RELAY_DOMAINS:'plottwistco.com'};
    expect(await provisionCompanyEventEmailSenders({...deps,apply:true})).toMatchObject([{status:'blocked',reason:'EVENT_RELAY_ROUTE_REQUIRED'}]);
    expect(deps.directory.createGroup).not.toHaveBeenCalled();expect(deps.identities.create).not.toHaveBeenCalled();
  });
  it('does not report readiness when owner delivery or app-manager membership is wrong',async()=>{
    const deps=fixtures();deps.directory.addGroupMember.mockResolvedValue({email:'michael@plottwistco.com',role:'OWNER',delivery_settings:'ALL_MAIL'});
    expect(await provisionCompanyEventEmailSenders({...deps,apply:true})).toMatchObject([{status:'blocked',reason:'EVENT_GROUP_MEMBERSHIP_UNVERIFIED'}]);
    expect(deps.identities.create).not.toHaveBeenCalled();
  });
  it('verifies subscriptions from individual member records when the list endpoint omits them',async()=>{
    const deps=fixtures();deps.directory.listGroupMembers.mockResolvedValue([{email:'michael@plottwistco.com',role:'OWNER'},{email:'ai@plottwistco.com',role:'MANAGER'}]);
    expect(await provisionCompanyEventEmailSenders({...deps,apply:true})).toMatchObject([{status:'ready'}]);
    expect(deps.directory.listGroupMembers).not.toHaveBeenCalled();
  });
});
