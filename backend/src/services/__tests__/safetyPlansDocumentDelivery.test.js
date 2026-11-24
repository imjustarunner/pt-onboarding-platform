import {expect,it,vi} from 'vitest';
import {sendDocumentDelivery} from '../clinicalDocumentShareDelivery.js';
import {matchReleaseContact} from '../safetyPlans/releaseFiling.js';

const mocks=vi.hoisted(()=>({send:vi.fn(),sms:vi.fn(),notifyre:vi.fn()}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:async()=>({
  url:path=>'https://auricwell.com/synthetic/'+path,
  portal:{slug:'synthetic',clinical_portal:true},
  brand:{name:'Synthetic Agency',clinical:true,products:[]}
})}));
vi.mock('../clinicalPortalSetupEmail.service.js',()=>({clinicalEmailPortalLink:async()=>({url:'https://auricwell.com/synthetic/setup'})}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantFormsMailbox:async()=>({forms:{id:92},domain:'example.invalid'})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:mocks.send}));
vi.mock('../clinicalDocumentShareRecipients.js',()=>({documentTextDelivery:mocks.sms}));
vi.mock('../notifyre.service.js',()=>({sendNotifyreSms:mocks.notifyre}));

const recipient={name:'Synthetic Parent',kind:'guardian',email:'parent@example.invalid',userId:20,portal:'setup',locale:'en'};
const params={agencyId:2,clientId:41,recipient,actorId:8,deliveryId:31,token:'a'.repeat(64)};

it('uses the agency forms sender, staffed reply address and account CTA in one co-branded email',async()=>{
  mocks.send.mockResolvedValueOnce({id:'sent-message'});
  const outcome=await sendDocumentDelivery({...params,channel:'email'});
  expect(outcome).toEqual({state:'sent',reference:'sent-message'});
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:92,to:recipient.email,
    replyToOverride:'support@example.invalid',privateDocumentDeliveryId:31,
    html:expect.stringContaining('Create your account'),text:expect.stringContaining('/sign/documents#')}));
  const payload=mocks.send.mock.calls[0][0];
  expect(payload.html).toContain('Synthetic Agency');
  expect(payload.text).not.toContain(recipient.name);
});

it('uses Notifyre only when the eligible appointment-line delivery is returned',async()=>{
  mocks.sms.mockResolvedValueOnce(null);
  expect(await sendDocumentDelivery({...params,channel:'sms'})).toEqual({state:'failed'});
  expect(mocks.notifyre).not.toHaveBeenCalled();
  mocks.sms.mockResolvedValueOnce({from:'+13035550100'});
  mocks.notifyre.mockResolvedValueOnce({sid:'notifyre:synthetic'});
  expect(await sendDocumentDelivery({...params,channel:'sms'})).toEqual({state:'queued',reference:'notifyre:synthetic'});
});

it('matches the named ROI contact without merging conflicting household details',()=>{
  const contact={id:9,contact_full_name:'Synthetic Recipient',contact_phone:'+1 (303) 555-0100',contact_email:'recipient@example.invalid',is_active:1,contact_is_active:1};
  expect(matchReleaseContact([contact],{recipientName:'Synthetic Recipient',recipientPhone:'303-555-0100'})).toEqual({state:'linked',affiliationId:9});
  expect(matchReleaseContact([contact],{recipientName:'Another Person',recipientEmail:contact.contact_email})).toEqual({state:'needs_review'});
  expect(matchReleaseContact([],{recipientName:'Synthetic Recipient'})).toEqual({state:'new'});
});
