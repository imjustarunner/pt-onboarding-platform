import {expect,it,vi} from 'vitest';
import {groupEmailIdentity} from '../groupEmailIdentity.js';
vi.mock('../workspaceMailboxType.service.js',()=>({workspaceMailboxType:vi.fn()}));
import {workspaceMailboxType} from '../workspaceMailboxType.service.js';
import {canImportPersonalMailboxEmail} from '../personalMailboxImportPolicy.service.js';
const group={agency_id:10,group_key:'technology',email:'technology@agency.invalid',label:'Agency Technology Team'};
it('uses the actual destination group and its human label, never a personal mailbox or sender membership',()=>{
 expect(groupEmailIdentity({agency_id:10,kind:'shared',identity_key:'technology',from_email:' TECHNOLOGY@AGENCY.INVALID ',display_name:'Old label'},[group])).toMatchObject({groupName:'Agency Technology Team',ticketed:true});
 for(const personal of [{kind:'personal'},{kind:'shared',owner_user_id:4},{kind:'shared',identity_key:'personal_4'},{kind:'shared',identity_key:'login_4'}])expect(groupEmailIdentity({agency_id:10,from_email:group.email,...personal},[group])).toBeNull();
 expect(groupEmailIdentity({agency_id:10,kind:'personal',from_email:'person@agency.invalid',display_name:'Michael',sender_email:group.email},[group])).toBeNull();
 expect(groupEmailIdentity({agency_id:20,kind:'shared',from_email:'team@agency.invalid'},[{...group,email:'team@agency.invalid'}])).toBeNull();
});
it('recognizes explicit nondepartmental app groups without treating them as tickets',()=>{
 expect(groupEmailIdentity({agency_id:10,kind:'shared',from_email:'team@agency.invalid'},[{...group,group_key:'team',email:'team@agency.invalid',label:'Clinical Team'}])).toMatchObject({groupName:'Clinical Team',ticketed:false});
});
it('does not import an SSO Workspace user mailbox merely because an app inbox exists',async()=>{
 workspaceMailboxType.mockResolvedValue('user');expect(await canImportPersonalMailboxEmail({from_email:'person@agency.invalid',identity_key:'personal_4'})).toBe(false);
 workspaceMailboxType.mockResolvedValue('group');expect(await canImportPersonalMailboxEmail({from_email:group.email})).toBe(true);
 workspaceMailboxType.mockRejectedValue(new Error('Directory unavailable'));await expect(canImportPersonalMailboxEmail({from_email:group.email})).rejects.toThrow('Directory unavailable');
});
