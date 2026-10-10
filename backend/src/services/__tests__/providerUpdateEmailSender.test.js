import {beforeEach,it,expect,vi} from 'vitest';
const list=vi.hoisted(()=>vi.fn());
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list}}));
import {resolveProviderUpdateSender} from '../providerUpdateEmailSender.service.js';
beforeEach(()=>vi.clearAllMocks());
it('uses the current agency PO address for From and Reply-To, not Technology or a default mailbox',async()=>{list.mockResolvedValue([{id:1,agency_id:3,from_email:'po@other.test'},{id:2,agency_id:2,from_email:'technology@itsco.health'},{id:3,agency_id:2,from_email:'PO@itsco.health',reply_to:'technology@itsco.health',is_active:1}]);const result=await resolveProviderUpdateSender(2);expect(result.identity.id).toBe(3);expect(result.replyTo).toBe('po@itsco.health');expect(list).toHaveBeenCalledWith({agencyId:2,includePlatformDefaults:false,onlyActive:true});});
it('blocks a send instead of silently choosing another sender when PO is absent or inactive',async()=>{list.mockResolvedValue([{id:1,agency_id:2,from_email:'po@itsco.health',is_active:0}]);await expect(resolveProviderUpdateSender(2)).rejects.toMatchObject({status:409});});

import {buildProviderUpdateInvitation} from '../../../../frontend/src/navigation/providerUpdateInvitation.js';
import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
it('allows the real provider invitation through attachment/link validation without attachments',()=>{
 const email=buildProviderUpdateInvitation({firstName:'Aneta',agencyName:'ITSCO',link:'https://app.itsco.health/provider-update/example'});
 expect(validateOutboundEmailQuality({...email,templateType:'provider_update_invite'})).toEqual({ok:true,flags:[]});
 expect(email.text).toContain('upload a screenshot');expect(email.html).toContain('upload a screenshot');
 expect(validateOutboundEmailQuality({...email,text:email.text+' See attached agreement.',templateType:'provider_update_invite'}).flags).toContainEqual(expect.objectContaining({code:'missing_attachment'}));
});

import {providerUpdateAuditBcc} from '../providerUpdateAuditCopy.js';
it('copies only the two authorized October ITSCO invitations to Michael',()=>{
 for(const pushId of [2,5])for(const providerUserId of [485,494])expect(providerUpdateAuditBcc({agencyId:2,pushId,providerUserId})).toEqual(['michael@plottwistco.com']);
 for(const scope of [{agencyId:2,pushId:2,providerUserId:482},{agencyId:6,pushId:2,providerUserId:485},{agencyId:2,pushId:3,providerUserId:494},{}])expect(providerUpdateAuditBcc(scope)).toBeNull();
});
