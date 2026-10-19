import { it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../passwordRecovery.service.js',()=>({requestPasswordRecoveryEmail:vi.fn()}));
import { enrollmentPortalAccess } from '../enrollmentPortalAccess.service.js';
const guardian={id:8,email:'saved@example.test',role:'client_guardian',password_hash:null};
const context={submission:{status:'submitted',guardian_user_id:8},agency:{id:4,slug:'agency',portal_url:'agency',public_domain:'agency.test'},req:{body:{email:'attacker@example.test'}}};
it('looks up the linked account and never emails a browser-supplied address or returns a token',async()=>{
 const recover=vi.fn().mockResolvedValue({deliveryStatus:'sent',resetLink:'secret',sendResult:{token:'secret'}});
 const result=await enrollmentPortalAccess({...context,sendSetupEmail:true},{users:{findById:async()=>guardian},recover});
 expect(recover).toHaveBeenCalledWith(expect.objectContaining({email:'saved@example.test',targetUser:guardian}));
 expect(result.deliveryStatus).toBe('sent');expect(JSON.stringify(result)).not.toContain('secret');expect(result.needsPasswordSetup).toBe(true);
});
it('does not send or rotate credentials when the completion page opens',async()=>{
 const recover=vi.fn();await enrollmentPortalAccess(context,{users:{findById:async()=>guardian},recover});expect(recover).not.toHaveBeenCalled();
});
it('does not look up or email school credentials merely when the completion page opens',async()=>{
 const recover=vi.fn(),users={findById:vi.fn()};
 for(const school of [{schoolOrganizationId:20},{invitationDeferred:true}]) {
   const result=await enrollmentPortalAccess({...context,...school,sendSetupEmail:false},{users,recover});
   expect(result).toMatchObject({invitationDeferred:true,deliveryStatus:'not_requested'});
   expect(result).not.toHaveProperty('portalLoginUrl');
 }
 expect(recover).not.toHaveBeenCalled();expect(users.findById).not.toHaveBeenCalled();
});
it('allows a school parent to explicitly request optional password setup',async()=>{
 const recover=vi.fn().mockResolvedValue({deliveryStatus:'sent'}),users={findById:async()=>guardian};
 const result=await enrollmentPortalAccess({...context,schoolOrganizationId:20,invitationDeferred:true,sendSetupEmail:true},{users,recover});
 expect(recover).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({email:guardian.email}));
 expect(result.deliveryStatus).toBe('sent');expect(result.portalLoginUrl).toBeTruthy();
});
it('blocks drafts, unlinked submissions and non-guardian accounts',async()=>{
 const recover=vi.fn(),users={findById:async()=>({...guardian,role:'super_admin'})};
 await expect(enrollmentPortalAccess({...context,submission:{status:'started',guardian_user_id:8}},{users,recover})).rejects.toThrow('after enrollment');
 await expect(enrollmentPortalAccess({...context,submission:{status:'submitted'}},{users,recover})).rejects.toThrow('account is linked');
 await expect(enrollmentPortalAccess(context,{users,recover})).rejects.toThrow('contact the agency');expect(recover).not.toHaveBeenCalled();
});
it('surfaces unsuccessful delivery without claiming an email was sent',async()=>{
 const result=await enrollmentPortalAccess({...context,sendSetupEmail:true},{users:{findById:async()=>guardian},recover:async()=>({outcome:'failed',deliveryStatus:'failed'})});expect(result.deliveryStatus).toBe('failed');
});
