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
