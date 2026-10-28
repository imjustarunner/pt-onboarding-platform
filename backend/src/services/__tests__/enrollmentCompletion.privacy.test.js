import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), update: vi.fn(), find: vi.fn(), remove: vi.fn(), send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, query: m.query, getConnection: async () => ({ execute: async () => [[{ acquired: 1 }]], release: vi.fn() }) }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { updateById: m.update, findById: m.find, findBySessionToken: m.find, deleteById: m.remove } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: async () => ({ id: 20 }) } }));
vi.mock('../../models/EmailTemplate.model.js', () => ({ default: { findById: async () => null, findByTypeAndAgency: async () => null } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, name: 'ITSCO', slug: 'itsco' }) } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send, sendNotificationEmail: vi.fn(), logSkippedOrFailedEmail: vi.fn() }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: async () => ({ id: 3 }), resolvePreferredSenderIdentityForSchoolThenAgency: vi.fn() }));
vi.mock('../clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));

import { purgeByDeletionToken, purgeUnfinishedEnrollmentDraft, runUnfinishedEnrollmentReminderTick, hashDeletionToken } from '../intakeUnfinishedReminder.service.js';
import { getPublicIntakeDeleteDataPage, postPublicIntakeDeleteData, deletePublicIntakeSession, getPublicIntakeProgress, resolvePacketCompletionEmailContent } from '../../controllers/publicIntake.controller.js';
import { buildDefaultRoiEmailBody, buildRoiEmailHtml, buildSchoolRoiSigningUrl } from '../../controllers/clientSchoolRoiAccess.controller.js';

beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[]]); m.query.mockResolvedValue([[]]); m.update.mockResolvedValue({ id: 11 }); });
const response = () => ({ status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn() });

describe('enrollment reminder opt-out preserves records', () => {
  it('opening the link shows confirmation without changing or deleting anything', async () => {
    const res = response(), next = vi.fn();
    await getPublicIntakeDeleteDataPage({ params: { publicKey: 'form' }, query: { token: 'private-token' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Stop enrollment reminders'));
    expect(m.execute).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it('the legacy deletion link stops only the matched enrollment reminders', async () => {
    m.execute.mockResolvedValueOnce([[{ id: 11 }]]);
    expect(await purgeByDeletionToken({ publicKey: 'form', rawToken: 'private-token' })).toEqual({ ok: true, remindersStopped: true, recordsRetained: true });
    expect(m.execute.mock.calls[0][1]).toEqual(['form', hashDeletionToken('private-token')]);
    expect(m.execute.mock.calls[0][0]).toContain('deletion_token_expires_at > NOW()');
    expect(m.execute.mock.calls[0][0]).toContain("<> 'submitted'");
    expect(m.update).toHaveBeenCalledExactlyOnceWith(11, { reminder_opt_out_at: expect.any(Date) });
    expect(m.remove).not.toHaveBeenCalled();
  });
  it('unknown or expired tokens do not modify records', async () => {
    expect(await purgeByDeletionToken({ publicKey: 'form', rawToken: 'expired' })).toMatchObject({ ok: false });
    expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it('does not claim success when the opt-out update fails', async () => {
    m.execute.mockResolvedValueOnce([[{ id: 11 }]]); m.update.mockRejectedValueOnce(new Error('offline'));
    await expect(purgeByDeletionToken({ publicKey: 'form', rawToken: 'token' })).rejects.toThrow('offline');
  });
  it('the POST confirmation reports retained records', async () => {
    m.execute.mockResolvedValueOnce([[{ id: 11 }]]);
    const res = response();
    await postPublicIntakeDeleteData({ params: { publicKey: 'form' }, body: { token: 'token' }, get: () => 'application/json' }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ ok: true, remindersStopped: true, recordsRetained: true });
  });
  it('canceling a draft revokes its access and reminders without erasing answers', async () => {
    m.find.mockResolvedValueOnce({ id: 11, intake_link_id: 20, status: 'started' });
    const res = response(), next = vi.fn();
    await deletePublicIntakeSession({ params: { publicKey: 'form' }, body: { sessionToken: 'token' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledExactlyOnceWith(11, { session_token: null, reminder_opt_out_at: expect.any(Date) });
    expect(m.remove).not.toHaveBeenCalled();
  });
  it('an expired resume request cannot trigger a fallback delete', async () => {
    m.find.mockResolvedValueOnce({ id: 11, intake_link_id: 20, status: 'started', draft_expires_at: '2020-01-01' });
    const res = response();
    await getPublicIntakeProgress({ params: { publicKey: 'form' }, query: { sessionToken: 'token' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(410); expect(m.remove).not.toHaveBeenCalled();
    expect(await purgeUnfinishedEnrollmentDraft({ submissionId: 11 })).toMatchObject({ deleted: 0, recordsRetained: true });
  });
  it('the hourly worker sends truthful copy and never deletes expired drafts', async () => {
    const row = { id: 11, agency_id: 2, public_key: 'form', session_token: 'token', status: 'started', reminder_consent_status: 'agreed', signer_email: 'parent@example.com', reminder_consent_at: new Date(Date.now() - 25 * 3600000), draft_expires_at: new Date(Date.now() + 86400000), deletion_token_hash: 'hash' };
    m.query.mockResolvedValueOnce([[row]]); m.find.mockResolvedValueOnce(row); m.send.mockResolvedValueOnce({ id: 'sent' });
    await runUnfinishedEnrollmentReminderTick();
    expect(m.query).toHaveBeenCalledTimes(1); expect(m.send).toHaveBeenCalledTimes(1);
    for (const body of [m.send.mock.calls[0][0].text, m.send.mock.calls[0][0].html]) {
      expect(body).toContain('does not delete saved records'); expect(body).toContain('Stop enrollment reminders');
      expect(body).not.toMatch(/permanently deleted|all my data|HIPAA-protected session/);
    }
    expect(m.remove).not.toHaveBeenCalled();
  });
});

describe('family notification client privacy', () => {
  it('school signing links use AuricWell instead of a local or unrelated frontend host', () => {
    expect(buildSchoolRoiSigningUrl('private/key')).toBe('https://auricwell.com/intake/private%2Fkey');
    expect(buildSchoolRoiSigningUrl('')).toBeNull();
  });
  it('uses initials in single-client receipt template placeholders', async () => {
    const result = await resolvePacketCompletionEmailContent({ link: { custom_messages: { completionEmailSubject: '{{CLIENT_NAME}} receipt', completionEmailBody: '{{CLIENT_SUMMARY}}\n{{DOWNLOAD_URL}}' } }, primaryClientName: 'David Example', clientCount: 1, signerName: 'Alex', downloadUrl: 'https://example.com/packet' });
    for (const value of [result.subject, result.text, result.html]) { expect(value).not.toContain('David Example'); expect(value).toContain('DAEX'); }
  });
  it('uses initials for every child without mutating document or client names', async () => {
    const clientBundles = [{ clientName: 'David Example', downloadUrl: 'https://example.com/1' }, { clientName: 'Avery Bennett', downloadUrl: 'https://example.com/2' }];
    const result = await resolvePacketCompletionEmailContent({ link: {}, primaryClientName: 'David Example', clientCount: 2, clientBundles });
    for (const value of [result.text, result.html]) { expect(value).toContain('DAEX'); expect(value).toContain('AVBE'); expect(value).not.toContain('David Example'); expect(value).not.toContain('Avery Bennett'); }
    expect(clientBundles[0].clientName).toBe('David Example');
  });
  it.each(['en', 'es'])('initial ROI request uses initials and a working action in %s', languageCode => {
    const linkUrl = 'https://auricwell.com/intake/synthetic';
    const body = buildDefaultRoiEmailBody({ agencyName: 'ITSCO', schoolName: 'Hogwarts', clientName: 'Avery Bennett — DEMO', linkUrl, languageCode });
    const html = buildRoiEmailHtml({ body, linkUrl, languageCode });
    expect(body).toContain('AVBE'); expect(body).not.toContain('Avery Bennett'); expect(body).toContain('Hogwarts');
    expect(html).toContain(`href="${linkUrl}"`); expect(html).toContain('display:inline-block');
  });
});
