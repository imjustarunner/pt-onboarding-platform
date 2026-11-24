import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute:vi.fn(), find:vi.fn(), insert:vi.fn(), complete:vi.fn(), send:vi.fn(), rows:vi.fn(), consent:vi.fn() }));
vi.mock('../../config/database.js', () => ({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js', () => ({default:{findById:async()=>({first_name:'Rory',last_name:'QA',email:'applicant@example.test'})}}));
vi.mock('../../models/Agency.model.js', () => ({default:{findById:async()=>({id:463,name:'Juniper QA'})}}));
vi.mock('../../models/HiringReferenceRequest.model.js', () => ({default:{expireStaleRows:vi.fn(),findByPublicLinkToken:m.find,recordLinkOpen:async()=>false,insertRow:m.insert,listByProfileAndAgency:m.rows,markCompleted:m.complete}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({sendEmailFromIdentity:m.send}));
vi.mock('../hiringReferenceIdentity.service.js', () => ({resolveHiringReferenceSenderIdentity:async()=>({id:51,agency_id:463}),resolveHiringReferenceReplyTo:async()=>'po@agency.test'}));
vi.mock('../hiringReferenceConsent.service.js', () => ({resolveHiringReferenceConsent:m.consent}));
vi.mock('../hiringReferenceReceipt.service.js', () => ({runReferenceReceiptNotifications:vi.fn()}));
vi.mock('../publicFormBranding.service.js', () => ({buildPublicFormBranding:async()=>null,resolveOrgLogoUrl:()=>null}));
vi.mock('../emailTemplate.service.js', () => ({default:{getTerminologySettings:()=>'People Operations'}}));
vi.mock('../hiringReferenceActivity.service.js', () => ({appendEmailOpenPixel:html=>html,buildReferenceOpenPixelUrl:()=>'',logHiringReferenceEvent:vi.fn()}));
import { createAndSendReferenceRequests, getPublicReferenceMetaByRawToken, submitPublicReferenceForm } from '../hiringReferenceRequests.service.js';
import { referenceContactDetails } from '../../utils/hiringReferenceContact.js';
import { referenceQuestionnaire } from '../../utils/hiringReferenceQuestionnaire.js';
const contact={name:'Taylor Reference',email:'taylor@example.test',phone:'555-0100',organization:'Example Consulting',relationship:'Former project mentor'};
const row=()=>({id:47,hiring_profile_id:253,agency_id:463,candidate_user_id:1871,reference_index:0,reference_name:contact.name,reference_email:contact.email,status:'sent',token_expires_at:new Date(Date.now()+86400000),questionnaire:referenceQuestionnaire});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.rows.mockResolvedValue([]);m.consent.mockResolvedValue({allowed:true,source:'profile'});m.find.mockResolvedValue(row());m.insert.mockImplementation(async input=>({...row(),referenceContact:input.referenceContact}));m.send.mockResolvedValue({id:'accepted'});m.complete.mockImplementation(async()=>({...row(),status:'completed'}));});
it('preserves free-text relationships without inventing a reporting relationship or copying unrelated fields',()=>{
 expect(referenceContactDetails({...contact,privateNote:'PRIVATE',otherReference:{email:'OTHER'}})).toEqual({referenceName:contact.name,referenceEmail:contact.email,referencePhone:contact.phone,referenceOrganization:contact.organization,relationshipType:'other',relationshipOther:contact.relationship,relationshipLabel:contact.relationship,relationshipDuration:''});
 expect(referenceContactDetails({...contact,relationship:'Direct supervisor'})).toMatchObject({relationshipType:'manager',relationshipOther:''});
 expect(referenceContactDetails({})).toMatchObject({referenceName:'',relationshipType:''});
});
it('captures only the selected applicant-provided contact in the manually sent invitation',async()=>{
 const profile={id:253,references_json:[contact,{name:'Other Reference',email:'other@example.test'}]};
 await createAndSendReferenceRequests({agencyId:463,candidateUserId:1871,profile,sentByUserId:1434,referenceIndex:0});
 expect(m.insert).toHaveBeenCalledOnce();expect(m.insert.mock.calls[0][0]).toMatchObject({referenceIndex:0,referenceContact:referenceContactDetails(contact)});
 expect(m.send.mock.calls.map(([input])=>input.to)).toEqual([contact.email,'applicant@example.test']);
 for (const [email] of m.send.mock.calls) {
  expect(email.html).toContain('plotline-primary-transparent.png');
  expect(email.html).toContain('Juniper QA</div>');
  expect(email.html).toContain('href="mailto:po@agency.test"');
 }
});
it('uses the original invitation snapshot even if the current reference list changes',async()=>{
 m.find.mockResolvedValue({...row(),referenceContact:referenceContactDetails(contact)});
 const meta=await getPublicReferenceMetaByRawToken('synthetic-token');
 expect(meta.referenceContact).toEqual(referenceContactDetails(contact));expect(m.execute).not.toHaveBeenCalled();
 expect(meta.contact).toEqual({email:'po@agency.test',teamLabel:'People Operations',supportUrl:'https://plotlinepo.com/support'});
 expect(JSON.stringify(meta)).not.toMatch(/public_link_token|responses_json|hiring_profile_id/);
});
it('prefills an older invitation only from its exact profile, index and matching email',async()=>{
 m.execute.mockResolvedValue([[{references_json:[contact,{name:'Other Reference',email:'other@example.test',phone:'PRIVATE'}]}]]);
 const meta=await getPublicReferenceMetaByRawToken('synthetic-token');
 expect(m.execute.mock.calls[0][1]).toEqual([253,1871]);expect(meta.referenceContact).toEqual(referenceContactDetails(contact));
 expect(JSON.stringify(meta)).not.toContain('PRIVATE');
});
it('never borrows another contact’s details when an older list entry has changed',async()=>{
 m.execute.mockResolvedValue([[{references_json:[{...contact,email:'other@example.test',phone:'PRIVATE'}]}]]);
 expect((await getPublicReferenceMetaByRawToken('synthetic-token')).referenceContact).toEqual(referenceContactDetails({name:contact.name,email:contact.email}));
});
it.each(['expired','cancelled','completed','send_failed'])('does not disclose any contact information for a %s request',async status=>{
 m.find.mockResolvedValue({...row(),status});
 const meta=await getPublicReferenceMetaByRawToken('synthetic-token');expect(meta).toHaveProperty('error');expect(meta.referenceContact).toBeUndefined();expect(m.execute).not.toHaveBeenCalled();
});
it('retains corrections with the completed reference and original contact evidence, while email goes to the invited address',async()=>{
 m.find.mockResolvedValue({...row(),referenceContact:referenceContactDetails(contact)});
 await submitPublicReferenceForm('synthetic-token',{referenceEmail:'updated@example.test',referencePhone:'555-0101',relationshipDuration:'3_5_years',strengths:'CONFIDENTIAL strengths',traits:Object.fromEntries(referenceQuestionnaire.traits.map(t=>[t.key,4]))});
 expect(m.complete.mock.calls[0][1]).toMatchObject({referenceName:contact.name,referenceEmail:'updated@example.test',referencePhone:'555-0101',relationshipType:'other',relationshipOther:contact.relationship,referenceContactSnapshot:referenceContactDetails(contact)});
 expect(m.send.mock.calls.map(([input])=>input.to)).toEqual([contact.email,'applicant@example.test']);
 expect(m.send.mock.calls.map(([input])=>input.html+input.text).join('')).not.toContain('CONFIDENTIAL strengths');
 expect(m.execute).not.toHaveBeenCalled();
});
it('rejects malformed contact corrections before completing the reference',async()=>{
 m.find.mockResolvedValue({...row(),referenceContact:referenceContactDetails(contact)});
 await expect(submitPublicReferenceForm('synthetic-token',{referenceEmail:'not-an-email'})).rejects.toThrow('valid contact email');
 expect(m.complete).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
