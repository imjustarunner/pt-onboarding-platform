import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../peopleOperationsSubmissionNotifications.service.js', () => ({ peopleOperationsNotificationRecipients: vi.fn(), singlePeopleOperationsMailbox: value => /^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(value || '') }));
vi.mock('../agencyAccessProfiles.service.js', () => ({ readAgencyAccess: vi.fn() }));
vi.mock('../hiringReferenceIdentity.service.js', () => ({ resolveHiringReferenceSenderIdentity: vi.fn(), resolveHiringReferenceReplyTo: vi.fn() }));
import { createReferenceReceiptWorker, referenceReceiptRoute, referenceReceiptContent, assertReferenceReceiptRecipient, referenceReceiptRecipient } from '../hiringReferenceReceipt.service.js';
import { readAgencyAccess } from '../agencyAccessProfiles.service.js';
import { queueReferenceReceipt } from '../hiringReferenceReceiptQueue.js';
import { referenceEmailFrame } from '../hiringReferenceEmail.service.js';
import { getNotificationCatalogEntry } from '../notificationCatalog.service.js';
import { hiringNotificationVisible } from '../notificationHiringAccess.service.js';

const event = { id: 11, notice_id: 21, recipient_user_id: 9, agency_id: 463, candidate_user_id: 1849, source_kind: 'online', source_id: 47, reference_index: 1 };
const row = { id: 463, name: 'Juniper QA', slug: 'juniper-qa', plotline_agency_id: 463, first_name: 'Rory', last_name: 'QA', reference_name: 'Taylor Reference', reference_index: 1, feature_flags: { googleSsoEnabled: true } };
let d;
beforeEach(() => {
  vi.clearAllMocks();
  d = { db: { execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT * FROM hiring_reference_receipt_events')) return [[]];
    if (sql.startsWith('SELECT n.id')) return [[event]];
    if (sql.includes("SET status='sending'")) return [{ affectedRows: 1 }];
    return [{ affectedRows: 1 }];
  }) }, source: vi.fn(async () => row), recipient: vi.fn(async () => ({ id: 9, work_email: 'recruiter@agency.test' })),
  recipients: vi.fn(async () => [{ id: 9 }]), notify: vi.fn(async () => ({ id: 31 })), communication: vi.fn(async () => ({ id: 41 })),
  identity: vi.fn(async () => ({ id: 51, agency_id: 463 })), replyTo: vi.fn(async () => 'po@agency.test'), send: vi.fn(async () => ({ id: 'accepted' })) };
});
describe('reference receipt channel and access', () => {
  it('requires a current effective agency hiring grant even for an administrator', async () => {
    const db = { execute: vi.fn(async () => [[{ id: 9, role: 'admin' }]]) };
    readAgencyAccess.mockResolvedValue({ role: 'admin', permissions: { has_hiring_access: false } });
    expect(await referenceReceiptRecipient(9, 463, db)).toBeNull();
    readAgencyAccess.mockResolvedValue({ role: 'staff', permissions: { has_hiring_access: true } });
    expect(await referenceReceiptRecipient(9, 463, db)).toMatchObject({ id: 9 });
    readAgencyAccess.mockResolvedValue(null);
    expect(await referenceReceiptRecipient(9, 464, db)).toBeNull();
    expect(db.execute.mock.calls[0][0]).toContain('terminated_at IS NULL');
    expect(db.execute.mock.calls[0][0]).toContain('is_assistant_account');
  });
  it('sends only email to SSO hiring staff, with the exact applicant/reference link', async () => {
    await createReferenceReceiptWorker(d)();
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'recruiter@agency.test', replyToOverride: 'po@agency.test', templateType: 'hiring_reference_received', existingCommunicationId: 41 }));
    const { subject, text, html } = d.send.mock.calls[0][0];
    expect(subject).toBe('Reference received for Rory QA'); expect(text).toContain('Taylor Reference');
    expect(text).toContain('https://plotlinepo.com/juniper-qa/admin/hiring/applicants?');
    expect(text).toContain('referenceRequestId=47'); expect(text).toContain('candidateId=1849');
    expect(html).toContain('Open reference'); expect(html).toContain('A People Operations Platform');
  });
  it('creates only a personal app alert for non-SSO hiring staff', async () => {
    d.recipient.mockResolvedValue({ id: 9, sso_password_override: 1, email: 'personal@example.test' });
    await createReferenceReceiptWorker(d)();
    expect(d.send).not.toHaveBeenCalled(); expect(d.communication).not.toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, agencyId: 463, relatedEntityId: 1849,
      audienceJson: { referenceIndex: 1, referenceRequestId: 47 }, message: 'Taylor Reference completed a reference for Rory QA.' }));
  });
  it('recognizes a verified dynamic QA inbox redirect, without accepting unproved or cross-company redirection', async () => {
    d.source.mockResolvedValue({...row,plotline_is_qa:1});
    d.send.mockResolvedValue({id:'qa-email',redirected:true,testInboxRedirect:{agencyId:463,deliveredTo:['testing@itsco.health']}});
    await createReferenceReceiptWorker(d)();expect(d.db.execute.mock.calls.at(-1)[1][0]).toBe('sent');
    d.send.mockResolvedValue({id:'qa-email',redirected:true,testInboxRedirect:{agencyId:464,deliveredTo:['testing@itsco.health']}});
    await createReferenceReceiptWorker(d)();expect(d.db.execute.mock.calls.at(-1)[1][0]).toBe('held');
  });
  it('uses app-only delivery in a company without SSO and never falls back to personal SSO mail', () => {
    expect(referenceReceiptRoute({ email: 'person@example.test' }, { feature_flags: {} }).channel).toBe('in_app');
    expect(referenceReceiptRoute({ email: 'personal@example.test', personal_email: 'personal@example.test' }, row)).toEqual({ channel: 'email', to: null });
    expect(referenceReceiptRoute({ login_is_group_email: 1 }, row).channel).toBe('in_app');
  });
  it.each([null, false])('withholds alerts when current agency hiring access or the source is missing (%s)', async value => {
    if (value === null) d.recipient.mockResolvedValue(null); else d.source.mockResolvedValue(null);
    await createReferenceReceiptWorker(d)(); expect(d.send).not.toHaveBeenCalled(); expect(d.notify).not.toHaveBeenCalled();
    expect(d.db.execute.mock.calls.at(-1)[1][0]).toBe('skipped');
  });
  it('claims once across replicas and records ambiguous delivery without resending', async () => {
    d.send.mockRejectedValue(new Error('Transport timeout'));
    await createReferenceReceiptWorker(d)(); expect(d.db.execute.mock.calls.at(-1)[1][0]).toBe('held');
    d.db.execute.mockImplementation(async sql => sql.startsWith('SELECT n.id') ? [[event]] : sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 0 }]);
    await createReferenceReceiptWorker(d)(); expect(d.send).toHaveBeenCalledTimes(1);
  });
  it('deduplicates initialization and queues without confidential answers', async () => {
    d.db.execute.mockImplementation(async sql => sql.startsWith('SELECT * FROM') ? [[event]] : sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 1 }]);
    await createReferenceReceiptWorker(d)(); expect(d.db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE'), [11, 9]);
    const db = { execute: vi.fn() };
    await queueReferenceReceipt(db, { agencyId: 463, candidateUserId: 1849, sourceKind: 'online', sourceId: 47, referenceIndex: 1 });
    expect(db.execute.mock.calls[0][1]).toEqual([463, 1849, 'online', 47, 1]);
  });
  it('rechecks the recipient, sender and channel again at email approval', async () => {
    const input = { templateType: 'hiring_reference_received', agencyId: 463, senderIdentityId: 51, userId: 9, to: 'recruiter@agency.test', existingCommunicationId: 41 };
    await expect(assertReferenceReceiptRecipient(input, d)).resolves.toBeUndefined();
    for (const change of [{ to: 'another@agency.test' }, { cc: 'private@example.test' }, { userId: 10 }, { senderIdentityId: 52 }, { existingCommunicationId: null }]) {
      if (change.existingCommunicationId === null) d.db.execute.mockResolvedValueOnce([[]]);
      await expect(assertReferenceReceiptRecipient({ ...input, ...change }, d)).rejects.toHaveProperty('code', 'REFERENCE_RECEIPT_ACCESS');
    }
    d.recipient.mockResolvedValue(null);
    await expect(assertReferenceReceiptRecipient(input, d)).rejects.toHaveProperty('code', 'REFERENCE_RECEIPT_ACCESS');
    d.recipient.mockResolvedValue({ id: 9, sso_password_override: 1 });
    await expect(assertReferenceReceiptRecipient(input, d)).rejects.toHaveProperty('code', 'REFERENCE_RECEIPT_ACCESS');
  });
  it('keeps app receipts out of generic email/digests and hides them after hiring access is revoked', () => {
    const type = 'hiring_reference_received';
    expect(getNotificationCatalogEntry(type).capabilities).toMatchObject({ email: false, sms: false, digest: false });
    expect(hiringNotificationVisible({ type, agency_id: 463 }, new Set([463]))).toBe(true);
    expect(hiringNotificationVisible({ type, agency_id: 463 }, new Set([464]))).toBe(false);
  });
  it('links phone completions separately and escapes identities in branded emails', () => {
    const content = referenceReceiptContent({ ...event, source_kind: 'phone' }, { ...row, reference_name: '<Private>' });
    expect(content.url).toContain('referenceContactId=47'); expect(content.html).toContain('&lt;Private&gt;');
    const html = referenceEmailFrame({ agency: { name: '<Agency>' }, heading: 'Thank you for submitting a reference', body: '<p>Your answers remain confidential.</p>' });
    expect(html).toContain('&lt;Agency&gt;'); expect(html).toContain('Want to use Plotline for your organization?');
    expect(html).toContain('A People Operations Platform');
  });
});
