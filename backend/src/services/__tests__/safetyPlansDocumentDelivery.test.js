import {expect,it,vi} from 'vitest';
import {sendDocumentDelivery} from '../clinicalDocumentShareDelivery.js';
import {matchReleaseContact} from '../safetyPlans/releaseFiling.js';

const mocks=vi.hoisted(()=>({send:vi.fn(),sms:vi.fn(),notifyre:vi.fn(),emailPolicy:vi.fn()}));
vi.mock('../clinicalDocumentShareQa.js',async importOriginal=>({
  ...await importOriginal(),documentEmailPolicy:mocks.emailPolicy,
  qaDocumentFormsMailbox:async()=>({forms:{id:93},domain:'itsco.health'})
}));
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
  mocks.emailPolicy.mockResolvedValueOnce({allowed:true,testInbox:false});
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

it('keeps the link usable only for a verified testing-group transport receipt',async()=>{
  mocks.emailPolicy.mockResolvedValue({allowed:true,testInbox:true});
  const fake={...recipient,email:'qa.document.fixture@example.com'};
  mocks.send.mockResolvedValueOnce({id:'qa-accepted',redirected:true,
    testInboxRedirect:{agencyId:450,deliveredTo:['testing@itsco.health']}});
  expect(await sendDocumentDelivery({...params,agencyId:450,recipient:fake,channel:'email'})).toEqual({state:'sent',reference:'qa-accepted'});
  expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({to:fake.email,qaDocumentRedirect:true,
    replyToOverride:'testing@itsco.health',senderIdentityId:93}));
  mocks.send.mockResolvedValueOnce({id:'wrong-recipient',redirected:true,
    testInboxRedirect:{agencyId:450,deliveredTo:['different@example.invalid']}});
  expect(await sendDocumentDelivery({...params,agencyId:450,recipient:fake,channel:'email'})).toEqual({state:'failed'});
});

it('rejects test-mail delivery for real charts and for non-example addresses in the QA tenant',async()=>{
  const {documentEmailPolicy}=await vi.importActual('../clinicalDocumentShareQa.js');
  const db={execute:vi.fn()};
  const chart={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}},is_demo:1};
  db.execute.mockResolvedValueOnce([[{...chart,is_demo:0}]]);
  const synthetic={...recipient,email:'synthetic@example.com'};
  expect(await documentEmailPolicy({agencyId:450,clientId:41,recipient:synthetic},db)).toMatchObject({allowed:false});
  expect(await documentEmailPolicy({agencyId:450,clientId:41,recipient},db)).toMatchObject({allowed:false});
  db.execute.mockResolvedValueOnce([[chart]]).mockResolvedValueOnce([[{id:20}]]);
  expect(await documentEmailPolicy({agencyId:450,clientId:42,recipient:synthetic},db)).toEqual({allowed:true,testInbox:true});
});
