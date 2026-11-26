import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), user: vi.fn(), send: vi.fn(), receipt: vi.fn(), peopleOps: vi.fn(), portal: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.user } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: mocks.send, sendEmailFromIdentity: mocks.receipt }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: mocks.peopleOps } }));
vi.mock('../../controllers/prehirePortal.controller.js', () => ({ portalStateForUser: mocks.portal }));
import { sendPrehirePortalInviteEmail, prehireInviteDelivery, prehireInviteDetails, previewPrehireInviteEmail } from '../prehireInviteEmail.service.js';
import { rewriteHogwartsOutboundRecipient } from '../../utils/hogwartsTestEmail.js';
const args = { agencyId: 1, candidateUserId: 22, portalLink: 'https://app.itsco.health/pre-hire/test-token', generatedByUserId: 7, source: 'manual' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.peopleOps.mockResolvedValue({ id: 14, agency_id: 1, from_email: 'PO@itsco.health', reply_to: 'other@itsco.health' });
  mocks.receipt.mockResolvedValue({ id: 'staff-receipt' });
  mocks.user.mockResolvedValue({ first_name: 'Jordan', email: 'jordan@example.com', personal_email: 'jordan@example.com' });
  mocks.portal.mockResolvedValue({ agency: { id: 1 }, workflow: { steps: {
    pre_hire: [{ title: 'Background check' }, { title: 'Review employment agreement' },
      { title: 'Denver School-Based Counseling – Fingerprinting' }, { title: 'Final review', kind: 'review' }],
    onboarding: [{ title: 'Onboarding-only lesson' }]
  } } });
  mocks.execute.mockImplementation(async sql => {
    // Production agencies has no people_ops_email column; the invitation must not query it.
    if (/\bpeople_ops_email\b/.test(sql)) throw new Error("Unknown column 'people_ops_email'");
    if (sql.includes('SELECT prehire_settings')) return [[{ name: 'ITSCO', slug: 'itsco', prehire_settings: '{}' }]];
    if (sql.includes('SELECT hp.applied_role')) return [[{ job_title: 'School Counselor' }]];
    if (sql.includes('SELECT g.token_values_json')) return [[{ token_values_json: JSON.stringify({ START_DATE: '2026-10-12', MIN_HOURS: '12' }) }]];
    return [[]];
  });
  // Exercise the actual shared redirect function; never contact an email provider.
  mocks.send.mockImplementation(async options => {
    const result = await rewriteHogwartsOutboundRecipient(options);
    return { id: 'gmail-message', communicationId: 9, redirected: result.redirected, originalTo: result.originalTo };
  });
});
describe('pre-hire invitation delivery', () => {
  it('routes Jordan’s example address to testing and includes the saved prehire information and tenant link', async () => {
    const result = await sendPrehirePortalInviteEmail(args);
    expect(result).toMatchObject({ status: 'sent', deliveredTo: 'testing@itsco.health', originalTo: 'jordan@example.com' });
    expect(mocks.receipt).not.toHaveBeenCalled();
    const email = mocks.send.mock.calls[0][0];
    expect(email).toMatchObject({ source: 'manual', generatedByUserId: 7, userId: 22, to: 'jordan@example.com' });
    for (const value of ['School Counselor', 'October 12, 2026', '12', 'Review employment agreement', args.portalLink]) {
      expect(email.text).toContain(value);
      expect(email.html).toContain(value);
    }
  });
  it('sends a real applicant’s invitation to their personal address without redirecting to testing', async () => {
    mocks.user.mockResolvedValue({ first_name: 'Candidate', email: 'staff@agency.org', personal_email: 'candidate@gmail.com' });
    const result = await sendPrehirePortalInviteEmail(args);
    expect(result).toMatchObject({ status: 'sent', redirected: false, deliveredTo: 'candidate@gmail.com' });
    expect(mocks.send.mock.calls[0][0].to).toBe('candidate@gmail.com');
  });
  it('adds the portal link to custom messages that omit it', async () => {
    await sendPrehirePortalInviteEmail({ ...args, customBody: 'Hello {{FIRST_NAME}}, welcome!' });
    const email = mocks.send.mock.calls[0][0];
    expect(email.text).toContain('Hello Jordan, welcome!');
    expect(email.text).not.toContain('{');
    expect(email.text).toContain(args.portalLink);
    expect(email.html).toContain(`href="${args.portalLink}"`);
  });
  it.each([
    [{ skipped: true, reason: 'notifications_disabled' }, 'failed'],
    [{ blocked: true, reason: 'quality_flags' }, 'failed'],
    [{ queued: true, pendingApproval: true }, 'pending'],
    [{ ok: true }, 'failed']
  ])('does not disguise held or skipped sends as successful or retry around them', async (response, status) => {
    mocks.send.mockResolvedValue(response);
    expect(await sendPrehirePortalInviteEmail(args)).toMatchObject({ status, deliveredTo: null });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('renders the branded invitation for preview without sending or generating a live link', async () => {
    const preview = await previewPrehireInviteEmail({ ...args, customSubject: 'Welcome', customBody: 'Hi {{FIRST_NAME}}', customNote: '<b>Remember your meeting</b>' });
    expect(preview).toMatchObject({ subject: 'Welcome', peopleOperationsEmail: 'po@itsco.health', foundersEmail: 'founders@itsco.health' });
    expect(preview.html).toContain('Plotline');
    expect(preview.html).toContain('https://preview.invalid/pre-hire');
    expect(preview.html).toContain('&lt;b&gt;Remember your meeting&lt;/b&gt;');
    expect(preview.html).not.toContain(args.portalLink);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([sql]) => /^UPDATE|^INSERT/i.test(sql))).toBe(false);
  });
  it('blind-copies the full invitation and note with the candidate sign-in link removed', async () => {
    mocks.user.mockResolvedValue({ first_name: 'Jordan', last_name: 'Cruz', personal_email: 'candidate@gmail.com' });
    const delivery = await sendPrehirePortalInviteEmail({ ...args, customNote: 'Private welcome note' });
    expect(delivery.peopleOperationsCopy).toMatchObject({ status: 'sent', recipientEmail: 'po@itsco.health', foundersEmail: 'founders@itsco.health' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ senderIdentityId: 14, replyToOverride: 'po@itsco.health' });
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('bcc');
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('cc');
    expect(mocks.receipt).toHaveBeenCalledTimes(1);
    const receipt = mocks.receipt.mock.calls[0][0];
    expect(receipt).toMatchObject({ to: 'po@itsco.health', bcc: 'founders@itsco.health', generatedByUserId: 7 });
    expect(receipt.text).toContain('Hi Jordan');
    expect(receipt.html).toContain('Denver School-Based Counseling – Fingerprinting');
    expect(JSON.stringify(receipt)).not.toContain(args.portalLink);
    expect(receipt.html).toContain('Private welcome note');
  });
  it('does not report success on provider errors', async () => {
    mocks.send.mockRejectedValue(new Error('Transport unavailable'));
    await expect(sendPrehirePortalInviteEmail(args)).rejects.toThrow('Transport unavailable');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not call an unknown transport result sent', () => {
    expect(prehireInviteDelivery(undefined, 'a@gmail.com')).toMatchObject({ status: 'failed', deliveredTo: null });
  });
  it('requires a tenant People Operations sender and never uses a fallback mailbox', async () => {
    mocks.peopleOps.mockResolvedValue(null);
    expect(await sendPrehirePortalInviteEmail(args)).toMatchObject({ status: 'failed', reason: 'no_people_operations_sender' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('keeps a successful invitation sent even if the staff receipt fails', async () => {
    mocks.user.mockResolvedValue({ first_name: 'Jordan', personal_email: 'candidate@gmail.com' });
    mocks.receipt.mockRejectedValueOnce(Object.assign(new Error('Transport unavailable'), { communicationId: 27 }));
    expect(await sendPrehirePortalInviteEmail(args)).toMatchObject({
      status: 'sent', peopleOperationsCopy: { status: 'failed', communicationId: 27 }
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});

it('uses the ordered pre-hire checklist in saved invitation previews and sends', async () => {
  const result = await previewPrehireInviteEmail(args);
  expect(mocks.portal).toHaveBeenCalledWith(22, { agencyId: 1 });
  const items = ['Background check', 'Review employment agreement', 'Denver School-Based Counseling – Fingerprinting', 'Submit pre-hire for review'];
  expect(result.html).toContain(items.map(item => `<li>${item}</li>`).join(''));
  expect(result.html).not.toContain('Onboarding-only lesson');
  await sendPrehirePortalInviteEmail(args);
  expect(mocks.send.mock.calls[0][0].html).toContain(items.map(item => `<li>${item}</li>`).join(''));
});

it('preserves optional steps and two distinct steps with matching titles', () => {
  const steps = [{ title: 'Review guide' }, { title: 'Review guide', required: false }, { title: 'Finish', kind: 'review' }];
  expect(prehireInviteDetails({}, steps).steps).toEqual(['Review guide', 'Review guide (optional)', 'Submit pre-hire for review']);
});
