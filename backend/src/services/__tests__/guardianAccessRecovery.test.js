import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {createGuardianAccessRecovery,GUARDIAN_RECOVERY_MESSAGE} from '../guardianAccessRecovery.service.js';
it.each(['client_guardian','guardian'])('sends a reset/setup link for an existing %s instead of only filing a ticket',async role=>{
 const user={id:7,role,status:'PENDING_SETUP'},recover=vi.fn(),help=vi.fn();
 const run=createGuardianAccessRecovery({users:{findByEmail:async()=>user},recover,help});
 expect(await run({email:'guardian@example.test',orgSlug:'tisi',req:{}})).toEqual({message:GUARDIAN_RECOVERY_MESSAGE});
 expect(recover).toHaveBeenCalledWith({email:'guardian@example.test',organizationSlug:'tisi',req:{},targetUser:user});expect(help).not.toHaveBeenCalled();
});
it('uses the same public response for token-only invitations and existing accounts',async()=>{
 const recover=vi.fn(),help=vi.fn();const run=createGuardianAccessRecovery({users:{findByEmail:async()=>null},recover,help});
 expect(await run({email:'guardian@example.test',orgSlug:'tisi'})).toEqual({message:GUARDIAN_RECOVERY_MESSAGE});expect(help).toHaveBeenCalled();expect(recover).not.toHaveBeenCalled();
});
it('does not report success if recovery or ticket creation fails',async()=>{
 const run=createGuardianAccessRecovery({users:{findByEmail:async()=>({id:7,role:'guardian'})},recover:async()=>{throw new Error('Unavailable');}});
 await expect(run({email:'guardian@example.test'})).rejects.toThrow('Unavailable');
});
