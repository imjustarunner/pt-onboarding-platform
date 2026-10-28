import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: vi.fn() } }));
import Agency from '../../models/Agency.model.js';
import { ensureEnrollmentCommunicationStep, intakeCommunicationDisclosure, validateAndStampIntakeCommunications, classifyIntakeReminderChoice } from '../intakeCommunicationChoices.service.js';
const agency = { id: 2, name: 'ITSCO', official_name: 'ITSCO, LLC' };
let cp, data;
beforeEach(() => {
  vi.resetAllMocks(); Agency.findById.mockResolvedValue(agency);
  const d = intakeCommunicationDisclosure(agency);
  cp = { version: d.version, disclosure: d.text, schoolDisclosure: d.schoolText,
    smsPreference: 'no', emailPreference: 'no', signerName: 'Test Guardian', signatureAccepted: true,
    termsUrl: 'https://www.itsco.health/itsco/terms', privacyUrl: 'https://www.itsco.health/itsco/privacypolicy' };
  data = { responses: { submission: { communicationPreferences: cp } } };
});
const stamp = () => validateAndStampIntakeCommunications({ link: { create_client: 1, intake_steps: [] }, agencyId: 2, intakeData: data, submittedAt: new Date('2026-10-06T12:00:00Z') });
it('adds communication choices to school enrollment without duplicating existing steps', () => {
  const steps = ensureEnrollmentCommunicationStep({ create_client: 1, scope_type: 'school' }, []);
  expect(steps).toHaveLength(1);
  expect(ensureEnrollmentCommunicationStep({ create_client: 1 }, steps)).toHaveLength(1);
});
it.each(['smart_school_roi', 'smart_disclosure', 'job_application'])('does not add enrollment consent to standalone %s', form_type => {
  expect(ensureEnrollmentCommunicationStep({ create_client: 1, form_type }, [])).toEqual([]);
});
it('accepts an all-No choice without demanding a phone', async () => {
  await stamp();
  expect(cp).toMatchObject({ activationStatus: 'declined', agencyId: 2, recipientPhone: null, signedAt: '2026-10-06T12:00:00.000Z' });
});
it('requires a choice rather than treating blank as consent', async () => {
  cp.smsPreference = '';
  await expect(stamp()).rejects.toMatchObject({ status: 400 });
});
it('requires a controlled recipient phone and a signature for a new Yes', async () => {
  cp.smsPreference = 'scheduling_only';
  await expect(stamp()).rejects.toThrow('phone');
  cp.recipientPhone = '(719) 555-0100'; cp.signatureAccepted = false;
  await expect(stamp()).rejects.toThrow('sign');
  cp.signatureAccepted = true; await stamp();
  expect(cp).toMatchObject({ recipientPhone: '+17195550100', activationStatus: 'awaiting_recipient_and_campaign_review' });
});
it('rejects altered disclosure instead of labeling it current signed evidence', async () => {
  cp.disclosure = 'Everyone must receive texts';
  await expect(stamp()).rejects.toThrow('Refresh');
});
it('keeps old Yes answers and attendance replies out of the signed consent count', () => {
  expect(classifyIntakeReminderChoice({ smsPreference: 'scheduling_only' })).toBe('legacy_yes_needs_evidence_review');
  expect(classifyIntakeReminderChoice({ attendance: 'Y' })).toBe('no_recorded_choice');
});

it('preserves the default PDF packet when adding choices to a legacy enrollment with no explicit steps', () => {
  const steps = ensureEnrollmentCommunicationStep({ create_client: 1, allowed_document_template_ids: [10, 20] }, []);
  expect(steps.map(s => s.type)).toEqual(['document', 'document', 'communications']);
  expect(steps[0].templateId).toBe(10);
});
it('shows communication choices to returning families as well as new families', () => {
  const [step] = ensureEnrollmentCommunicationStep({ create_client: 1 }, [{ type: 'communications', visibility: 'new_client_only', showIf: { hidden: true }, campaigns: { internalWorkforce: true } }]);
  expect(step).toMatchObject({ visibility: 'always', showIf: null, campaigns: { internalWorkforce: false } });
});
it.each(['school','agency'])('adds signed communication choices to %s enrollment',scope_type=>{
  expect(ensureEnrollmentCommunicationStep({create_client:1,scope_type},[])).toContainEqual(expect.objectContaining({type:'communications',campaigns:expect.objectContaining({internalWorkforce:false})}));
});
it('keeps account emails separate from marketing and records the displayed email disclosure',async()=>{
  cp.emailPreference='all';cp.emailDisclosure=intakeCommunicationDisclosure(agency).emailText;
  await stamp();expect(cp.emailActivationStatus).toBe('selected_subject_to_agency_controls');
  expect(cp.emailDisclosure).toContain('does not include marketing');
});
it('rejects changed email disclosures and requires a phone for care-team texts even when reminder texts are declined',async()=>{
  cp.emailDisclosure='Include ads';await expect(stamp()).rejects.toThrow('Email communication');
  delete cp.emailDisclosure;cp.providerTextingOptIn='yes';await expect(stamp()).rejects.toThrow('phone');
  cp.recipientPhone='+17195550100';cp.internalWorkforceOptIn='yes';await stamp();
  expect(cp.providerTextingActivationStatus).toBe('awaiting_recipient_and_campaign_review');expect(cp.internalWorkforceOptIn).toBeNull();
});

it('records essential-email notice and call choices separately without activating text campaigns',async()=>{
 const d=intakeCommunicationDisclosure(agency);
 Object.assign(cp,{emailNoticeVersion:d.emailNoticeVersion,essentialDisclosure:d.essentialText,emailDisclosure:d.emailText,noRoutineCalls:true,noAutomaticEmail:false,alternativeContactInstructions:' After 4 PM ',smsPreference:'scheduling_only',recipientPhone:'+17195550100'});
 await stamp();expect(cp).toMatchObject({noRoutineCalls:true,noAutomaticEmail:false,alternativeContactInstructions:'After 4 PM',emailActivationStatus:'declined',activationStatus:'awaiting_recipient_and_campaign_review'});
 expect(classifyIntakeReminderChoice(cp)).toBe('signed_choice_for_review');
});
it('does not silently convert a legacy No into the new essential-message policy',async()=>{
 const d=intakeCommunicationDisclosure(agency);cp.emailDisclosure=d.emailText.replace('Choose all optional account emails, scheduling only, or essential messages only.','Choose all account emails, scheduling only, or No.');
 cp.noRoutineCalls=true;cp.noAutomaticEmail=true;await stamp();expect(cp.emailPreference).toBe('no');expect(cp.emailNoticeVersion).toBeUndefined();expect(cp.noAutomaticEmail).toBeUndefined();
});
it('requires the exact new notice and explicit contact booleans for the new email policy',async()=>{
 const d=intakeCommunicationDisclosure(agency);Object.assign(cp,{emailNoticeVersion:d.emailNoticeVersion,emailDisclosure:d.emailText,noRoutineCalls:false,noAutomaticEmail:false});
 await expect(stamp()).rejects.toThrow('Email communication');cp.essentialDisclosure=d.essentialText;cp.noRoutineCalls='false';await expect(stamp()).rejects.toThrow('contact options');
});
it('finds this recipient’s signed choices even if another guardian submitted a newer packet',async()=>{
 const {default:pool}=await import('../../config/database.js');const {default:submissions}=await import('../../models/IntakeSubmission.model.js');
 const {latestIntakeCommunicationChoices}=await import('../intakeCommunicationChoices.service.js');
 pool.execute.mockResolvedValue([[{id:12},{id:11}]]);submissions.findById.mockImplementation(async id=>({signer_email:id===12?'other@example.test':'parent@example.test',intake_data:{submission:{communicationPreferences:{agencyId:2,noAutomaticEmail:id===11}}}}));
 expect(await latestIntakeCommunicationChoices(8,2,null,'parent@example.test')).toMatchObject({noAutomaticEmail:true,submissionId:11});
 expect(await latestIntakeCommunicationChoices(8,99,null,'parent@example.test')).toBeNull();
});
