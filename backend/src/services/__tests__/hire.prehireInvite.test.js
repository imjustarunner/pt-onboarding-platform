import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), user: vi.fn(), send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.user } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: mocks.send }));
import { sendPrehirePortalInviteEmail, prehireInviteDelivery } from '../prehireInviteEmail.service.js';
import { rewriteHogwartsOutboundRecipient } from '../../utils/hogwartsTestEmail.js';
const args = { agencyId: 1, candidateUserId: 22, portalLink: 'https://app.itsco.health/pre-hire/test-token', generatedByUserId: 7, source: 'manual' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ first_name: 'Jordan', email: 'jordan@example.com', personal_email: 'jordan@example.com' });
  mocks.execute.mockImplementation(async sql => {
    // Production agencies has no people_ops_email column; the invitation must not query it.
    if (/\bpeople_ops_email\b/.test(sql)) throw new Error("Unknown column 'people_ops_email'");
    if (sql.includes('SELECT prehire_settings')) return [[{ name: 'ITSCO', prehire_settings: '{}' }]];
    if (sql.includes('SELECT hp.applied_role')) return [[{ job_title: 'School Counselor' }]];
    if (sql.includes('SELECT g.token_values_json')) return [[{ token_values_json: JSON.stringify({ START_DATE: '2026-10-12', MIN_HOURS: '12' }) }]];
    if (sql.includes('SELECT title FROM hiring_prehire_checklist')) return [[{ title: 'Review employment agreement' }, { title: 'Background check' }]];
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
  });
  it('does not report success on provider errors', async () => {
    mocks.send.mockRejectedValue(new Error('Transport unavailable'));
    await expect(sendPrehirePortalInviteEmail(args)).rejects.toThrow('Transport unavailable');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not call an unknown transport result sent', () => {
    expect(prehireInviteDelivery(undefined, 'a@gmail.com')).toMatchObject({ status: 'failed', deliveredTo: null });
  });
});
