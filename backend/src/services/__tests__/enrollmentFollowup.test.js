import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollmentFollowupContext, enrollmentFollowupPreview, sendEnrollmentFollowup } from '../enrollmentFollowup.service.js';

let deps, db, client, body, action, events;
beforeEach(() => {
  action = null; events = [];
  client = { id: 51, agency_id: 2, organization_id: 9, status: 'PENDING_REVIEW', client_status_id: 3, provider_id: null };
  body = { request_key: 'reviewed_request_123456', disposition: 'inactive', reasons: ['paperwork'], termination_last_provider_id: null, email: { to: 'family@example.com', subject: 'Checking in', text: 'A staff-reviewed message.' } };
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, args) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT * FROM client_enrollment_followups')) return [[action].filter(Boolean)];
    if (sql.startsWith('SELECT id FROM client_enrollment_followups')) return [[]];
    if (sql.startsWith('INSERT INTO client_enrollment_followups')) { action = { id: 89, state: 'prepared', payload_hash: args[4], payload_json: JSON.parse(args[5]) }; return [{ insertId: 89 }]; }
    if (sql.startsWith('SELECT * FROM clients')) return [[client]];
    if (sql.includes("SET state='sending'")) action.state = 'sending';
    if (sql.includes("SET state='sent'")) { action.state = 'sent'; action.communication_id = args[0]; }
    if (sql.includes("SET state='awaiting_reply'")) action.state = 'awaiting_reply';
    if (sql.includes("SET state='delivery_unknown'")) action.state = 'delivery_unknown';
    if (sql.includes("SET state='held'")) action.state = 'held';
    return [{ affectedRows: 1 }];
  }) };
  deps = {
    pool: { getConnection: vi.fn(async () => db) },
    Agency: { findById: vi.fn(async id => id === 2 ? { id: 2, name: 'ITSCO', slug: 'itsco' } : { id: 9, name: 'Example School', organization_type: 'school' }) },
    ClientGuardian: { listForClient: vi.fn(async () => [{ email: 'family@example.com', access_enabled: 1 }, { email: 'revoked@example.com', access_enabled: 0 }]) },
    EmailSenderIdentity: { list: vi.fn(async () => [{ id: 12, agency_id: 2, from_email: 'schools@itsco.health' }]) },
    getClientStatusIdByKey: vi.fn(async ({ statusKey }) => statusKey === 'terminated' ? 7 : 8),
    clientTerminationDetails: vi.fn(async () => ({ termination_reason: null, termination_effective_date: null, termination_last_provider_id: null, termination_last_provider_name: null })),
    assertExchangeResolvedBeforeArchive: vi.fn(async () => {}),
    sendEmailFromIdentity: vi.fn(async () => { events.push('send'); return { id: 'accepted-1', communicationId: 99, internetMessageId: '<outbound-99@example.com>' }; }),
    Client: { update: vi.fn(async () => { events.push('status'); return { id: 51 }; }) }
  };
});
const send = () => sendEnrollmentFollowup({ client: { ...client }, actorUserId: 8, body }, deps);

describe('reviewed final enrollment outreach', () => {
  it('sends the reviewed branded email from schools@ before making the existing client inactive', async () => {
    expect(await send()).toMatchObject({ sent: true, clientId: 51, disposition: 'inactive', communicationId: 99 });
    expect(events).toEqual(['send', 'status']);
    expect(deps.sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 12, replyToOverride: 'schools@itsco.health', generatedByUserId: 8, source: 'manual', text: body.email.text, clientId: 51, html: expect.stringContaining('ITSCO') }));
    expect(deps.Client.update).toHaveBeenCalledWith(51, expect.objectContaining({ client_status_id: 7, enrollment_followup_id: 89, termination_effective_date: null }), 8, expect.objectContaining({ executor: db }));
    expect(db.commit).toHaveBeenCalledOnce();
    expect(action.state).toBe('awaiting_reply');
  });
  it('does not make a client inactive when delivery fails', async () => {
    deps.sendEmailFromIdentity.mockRejectedValueOnce(new Error('Mail unavailable'));
    await expect(send()).rejects.toMatchObject({ status: 409, deliveryReview: true });
    expect(deps.Client.update).not.toHaveBeenCalled();
    expect(action.state).toBe('delivery_unknown');
  });
  it.each([{ skipped: true }, { id: 'redirected', redirected: true }, { id: 'partial', relay: { partial: true } }])('does not change status when sending is held or incomplete: %j', async receipt => {
    deps.sendEmailFromIdentity.mockResolvedValueOnce(receipt);
    await expect(send()).rejects.toMatchObject({ status: 409 });
    expect(deps.Client.update).not.toHaveBeenCalled();
  });
  it('completes a failed status update on retry without sending the email again', async () => {
    deps.Client.update.mockRejectedValueOnce(new Error('Temporary storage error'));
    await expect(send()).rejects.toMatchObject({ followupSent: true });
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(await send()).toMatchObject({ sent: true });
    expect(deps.sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it('makes a repeated completed request idempotent', async () => {
    await send();
    expect(await send()).toMatchObject({ alreadyCompleted: true });
    expect(deps.sendEmailFromIdentity).toHaveBeenCalledOnce();
    expect(deps.Client.update).toHaveBeenCalledOnce();
  });
  it('does not resend a request whose delivery needs review', async () => {
    deps.sendEmailFromIdentity.mockRejectedValueOnce(new Error('Uncertain delivery'));
    await expect(send()).rejects.toThrow();
    await expect(send()).rejects.toMatchObject({ deliveryReview: true });
    expect(deps.sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it('supports the school waitlist outcome without terminating', async () => {
    body.disposition = 'waitlist'; body.reasons = ['tricare', 'office', 'school_waitlist'];
    await send();
    const patch = deps.Client.update.mock.calls[0][1];
    expect(patch).toMatchObject({ client_status_id: 8, status: 'PENDING_REVIEW' });
    expect(patch).not.toHaveProperty('terminated_at');
    expect(deps.assertExchangeResolvedBeforeArchive).not.toHaveBeenCalled();
  });
  it('rejects contradictory waitlist instructions before sending', async () => {
    body.reasons = ['school_waitlist'];
    await expect(send()).rejects.toMatchObject({ status: 400 });
    expect(deps.sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it('rejects an edited replay instead of duplicating the send', async () => {
    await send(); body.email.text = 'Changed after sending';
    await expect(send()).rejects.toMatchObject({ status: 409 });
    expect(deps.sendEmailFromIdentity).toHaveBeenCalledOnce();
  });
  it('does not change a newer client assignment after sending', async () => {
    deps.sendEmailFromIdentity.mockImplementationOnce(async () => { client.provider_id = 77; return { id: 'accepted', communicationId: 99 }; });
    await expect(send()).rejects.toMatchObject({ followupSent: true });
    expect(deps.Client.update).not.toHaveBeenCalled();
  });
  it('requires the correct tenant schools sender and offers only enabled family contacts', async () => {
    expect(await enrollmentFollowupContext(client, deps)).toMatchObject({ schoolName: 'Example School', recipients: ['family@example.com'], replyTo: 'schools@itsco.health' });
    deps.EmailSenderIdentity.list.mockResolvedValueOnce([{ id: 99, agency_id: 3, from_email: 'schools@other.test' }]);
    await expect(enrollmentFollowupContext(client, deps)).rejects.toMatchObject({ status: 409 });
  });
  it('escapes edited text in the email preview', async () => {
    const context = await enrollmentFollowupContext(client, deps);
    const html = enrollmentFollowupPreview(context, '<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('schools@itsco.health');
  });
  it.each([{ to: 'bad\r\nbcc: other@example.com' }, { subject: 'Subject\r\nBcc: other@example.com' }, { text: '' }])('validates the reviewed envelope before accessing the send lock', async email => {
    Object.assign(body.email, email);
    await expect(send()).rejects.toMatchObject({ status: 400 });
    expect(deps.pool.getConnection).not.toHaveBeenCalled();
  });
});
