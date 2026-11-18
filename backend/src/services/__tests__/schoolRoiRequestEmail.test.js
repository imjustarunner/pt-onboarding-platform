import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {schoolRoiRequestActions,buildSchoolRoiRequestEmail} from '../schoolRoiRequestEmail.service.js';
const input={client:{id:10,agency_id:2},guardian:{guardian_user_id:20,email:'parent@example.test'},issuedLink:{public_key:'personal-release',recipient_guardian_user_id:20},context:{portal:{slug:'itsco',clinical_portal:true}},actorUserId:30};
it.each([true,false])('keeps the exact ROI destination for existingAccount=%s and only prepares the recipient’s setup link',async existingAccount=>{
 const prepareAccess=vi.fn(async()=>({existingAccount,tokenResult:existingAccount?null:{token:'private-setup'}}));
 const inviteNotifications=vi.fn(async()=>({url:'https://auricwell.com/api/public/family-notifications/limited-token'}));
 const actions=await schoolRoiRequestActions(input,{loadUser:async()=>({id:20,email:input.guardian.email}),prepareAccess,inviteNotifications});
 expect(actions.releaseUrl).toBe('https://auricwell.com/intake/personal-release');
 expect(new URL(actions.portalUrl).searchParams.get('redirect')).toBe('/intake/personal-release');
 expect(actions.portalUrl).toContain(existingAccount?'/itsco/login':'/itsco/new_account/private-setup');
 expect(inviteNotifications).toHaveBeenCalledExactlyOnceWith({agencyId:2,clientId:10,guardianUserId:20,actorUserId:30});
 expect(actions.optInUrl).toMatch(/\/text$/);
 const email=buildSchoolRoiRequestEmail({agencyName:'Example',firstName:'Parent',actions,colorPalette:{primary:'#123456'}});
 expect(email.html.indexOf('Review and sign school ROI')).toBeLessThan(email.html.indexOf('data-roi-secondary-actions'));
 expect(email.html).toContain('https://auricwell.com/auricwell/logo.png');expect(email.html).toContain('background:#123456');expect(email.html).toContain('>Opt in</a>');
 expect(email.text).toContain('START');expect(email.html).not.toContain('signs you in automatically');
});
it('does not prepare any credentials for a different guardian or changed email',async()=>{
 const prepareAccess=vi.fn();
 await expect(schoolRoiRequestActions({...input,issuedLink:{...input.issuedLink,recipient_guardian_user_id:21}},{prepareAccess})).rejects.toThrow('separate');
 await expect(schoolRoiRequestActions(input,{loadUser:async()=>({email:'changed@example.test'}),prepareAccess})).rejects.toThrow('changed');
 expect(prepareAccess).not.toHaveBeenCalled();
});
it('respects a declined optional invitation while still preparing the ROI request',async()=>{
 const actions=await schoolRoiRequestActions(input,{loadUser:async()=>({email:input.guardian.email}),prepareAccess:async()=>({existingAccount:true}),inviteNotifications:async()=>{throw Object.assign(new Error('declined'),{status:409});}});
 expect(actions.optInUrl).toBeNull();expect(actions.releaseUrl).toContain('/intake/');
 const html=buildSchoolRoiRequestEmail({agencyName:'Example',actions}).html;expect(html).not.toContain('>Opt in</a>');
});
