import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{}}));
vi.mock('../gmailSendAs.service.js',()=>({ensureSendAsAlias:vi.fn()}));
import { ensurePortalDeliveryGroup, PORTAL_GROUP_DESCRIPTION } from '../portalGroupSender.service.js';
import { convertPortalAliasToGroup } from '../portalGroupMigration.service.js';
let d, admin;
beforeEach(()=>{
 admin={ users:{aliases:{delete:vi.fn(),insert:vi.fn()}},groups:{update:vi.fn(),get:vi.fn(),delete:vi.fn(async()=>{})} };
 d={getUser:vi.fn(async()=>null),getGroup:vi.fn(async()=>null),createGroup:vi.fn(async()=>({id:'g',description:PORTAL_GROUP_DESCRIPTION})),applyGroupAccessSettings:vi.fn(),addGroupMember:vi.fn(),getClient:vi.fn(async()=>admin)};
});
it('creates a restricted Google Group and adds the administrators after privacy is configured',async()=>{
 await ensurePortalDeliveryGroup({address:'portal@agency.test',displayName:'Agency Portal',directory:d});
 expect(d.createGroup).toHaveBeenCalledWith(expect.objectContaining({email:'portal@agency.test'}));
 expect(d.applyGroupAccessSettings).toHaveBeenCalledWith(expect.objectContaining({whoCanJoin:'INVITED_CAN_JOIN',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',allowExternalMembers:false,isArchived:false}));
 expect(d.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'ai@plottwistco.com'}));
 expect(d.applyGroupAccessSettings.mock.invocationCallOrder[0]).toBeLessThan(d.addGroupMember.mock.invocationCallOrder[0]);
});
it('does not silently reuse a user alias',async()=>{
 d.getGroup.mockRejectedValue({code:403});d.getUser.mockResolvedValue({primaryEmail:'ai@plottwistco.com'});
 await expect(ensurePortalDeliveryGroup({address:'portal@agency.test',directory:d})).rejects.toHaveProperty('code','PORTAL_USER_ALIAS_CONFLICT');
 expect(d.createGroup).not.toHaveBeenCalled();
});
it('does not mistake denied directory access for an available address',async()=>{
 d.getGroup.mockRejectedValue({code:403});await expect(ensurePortalDeliveryGroup({address:'portal@agency.test',directory:d})).rejects.toHaveProperty('code',403);expect(d.createGroup).not.toHaveBeenCalled();
});
it('keeps existing group access settings and membership intact',async()=>{
 d.getGroup.mockResolvedValue({id:'g',description:'Existing agency group'});
 await ensurePortalDeliveryGroup({address:'portal@agency.test',directory:d});expect(d.createGroup).not.toHaveBeenCalled();expect(d.applyGroupAccessSettings).not.toHaveBeenCalled();
});
const args={address:'portal@agency.test',displayName:'Agency Portal',suffix:'test',retryAttempts:1,retryDelayMs:0};
const aliasOwner={id:'u',primaryEmail:'ai@plottwistco.com',aliases:['portal@agency.test']};
it('previews a conversion without mutating either address',async()=>{
 d.getUser.mockResolvedValue(aliasOwner);expect(await convertPortalAliasToGroup({...args,directory:d})).toHaveProperty('state','ready_to_convert');expect(d.createGroup).not.toHaveBeenCalled();
});
it('secures and routes the staged group before removing only the intended alias',async()=>{
 d.getUser.mockResolvedValue(aliasOwner);admin.groups.get.mockResolvedValue({data:{email:args.address}});
 expect(await convertPortalAliasToGroup({...args,directory:d,apply:true})).toHaveProperty('state','converted');
 expect(d.addGroupMember.mock.invocationCallOrder[0]).toBeLessThan(admin.users.aliases.delete.mock.invocationCallOrder[0]);
 expect(admin.users.aliases.delete).toHaveBeenCalledWith({userKey:'u',alias:args.address});expect(admin.users.aliases.insert).not.toHaveBeenCalled();
});
it('restores the original alias if Google rejects the address transfer',async()=>{
 d.getUser.mockResolvedValue(aliasOwner);admin.groups.update.mockRejectedValue({code:409});admin.groups.get.mockResolvedValue({data:{email:'app-transition-test@agency.test'}});
 await expect(convertPortalAliasToGroup({...args,directory:d,apply:true})).rejects.toHaveProperty('code','PORTAL_GROUP_CONVERSION_FAILED');
 expect(admin.users.aliases.insert).toHaveBeenCalledWith({userKey:'u',requestBody:{alias:args.address}});expect(admin.groups.delete).toHaveBeenCalledWith({groupKey:'g'});
});
it('never converts an account primary address or another user’s alias',async()=>{
 d.getUser.mockResolvedValue({...aliasOwner,primaryEmail:args.address});await expect(convertPortalAliasToGroup({...args,directory:d,apply:true})).rejects.toThrow('explicit alias');expect(d.createGroup).not.toHaveBeenCalled();
});

it('restores the alias when a delete timeout follows successful deletion',async()=>{
 d.getUser.mockResolvedValueOnce(aliasOwner).mockResolvedValueOnce(null);
 admin.users.aliases.delete.mockRejectedValue({code:504});
 admin.groups.get.mockResolvedValue({data:{email:'app-transition-test@agency.test'}});
 await expect(convertPortalAliasToGroup({...args,directory:d,apply:true})).rejects.toHaveProperty('code','PORTAL_GROUP_CONVERSION_FAILED');
 expect(admin.users.aliases.insert).toHaveBeenCalledWith({userKey:'u',requestBody:{alias:args.address}});
 expect(admin.groups.delete).toHaveBeenCalled();
});

it('retries the address handoff while Google releases the alias',async()=>{
 d.getUser.mockResolvedValue(aliasOwner);
 admin.groups.update.mockRejectedValueOnce({code:409}).mockResolvedValueOnce({});
 admin.groups.get.mockResolvedValue({data:{email:args.address}});
 expect(await convertPortalAliasToGroup({...args,retryAttempts:2,directory:d,apply:true})).toHaveProperty('state','converted');
 expect(admin.groups.update).toHaveBeenCalledTimes(2);
 expect(admin.users.aliases.insert).not.toHaveBeenCalled();
});

it('never restores an alias when an accepted rename is still propagating',async()=>{
 d.getUser.mockResolvedValue(aliasOwner);
 admin.groups.get.mockResolvedValue({data:{email:'app-transition-test@agency.test'}});
 await expect(convertPortalAliasToGroup({...args,directory:d,apply:true})).rejects.toHaveProperty('code','GROUP_VERIFICATION_PENDING');
 expect(admin.users.aliases.insert).not.toHaveBeenCalled();
 expect(admin.groups.delete).not.toHaveBeenCalled();
});
