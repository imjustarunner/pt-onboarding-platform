import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../providerEnrollmentWaitlist.service.js', () => ({ loadEnrollmentWaitlist: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import { createProviderWaitlistEmailService, waitlistEmailWindow, buildProviderWaitlistEmail, resolveWaitlistMailboxes } from '../providerWaitlistEmail.service.js';

const base = { id: 4, clientId: 4, agencyId: 2, agencyName: 'Example agency', providerId: 9, providerName: 'Requested Provider', providerEmail: 'provider@example.test', submissionId: 15, joinedAt: '2026-10-01T12:00:00Z', contactEmail: 'caregiver@example.test', modality: 'VIRTUAL', status: 'WAITLIST' };
const week = number => new Date(Date.parse(base.joinedAt) + number * 7 * 86400000);
const identityRows = [
  { id: 10, agency_id: 2, is_active: 1, identity_key: 'notifications', from_email: 'notifications@tenant.test' },
  { id: 11, agency_id: 2, is_active: 1, identity_key: 'support', from_email: 'support@tenant.test' }
];
let rows, mailboxRows, inboundRoutes, ledger, nextId, lockAvailable, liveRows, send, execute, database, service;
beforeEach(() => {
  rows = [{ ...base }]; mailboxRows = structuredClone(identityRows); inboundRoutes = []; ledger = []; nextId = 1; lockAvailable = true; liveRows = null;
  send = vi.fn(async () => ({ id: 'gmail-message', communicationId: 45 }));
  execute = vi.fn(async (sql, args = []) => {
    if (sql.startsWith('SELECT DISTINCT c.agency_id')) return [[{ agency_id: 2 }]];
    if (sql.includes('FROM email_inbound_routes')) return [inboundRoutes];
    if (sql.includes('FROM email_sender_identities')) return [mailboxRows];
    if (sql.startsWith('INSERT IGNORE INTO provider_waitlist_email_deliveries')) {
      if (!ledger.some(job => job.agency_id === args[0] && job.client_id === args[1] && job.provider_id === args[2] && job.cycle_key === args[4] && job.week_number === args[5])) {
        ledger.push({ id: nextId++, agency_id: args[0], client_id: args[1], provider_id: args[2], submission_id: args[3], cycle_key: args[4], week_number: args[5], audience: args[6], delivery_status: 'pending', next_attempt_at: week(0) });
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM provider_waitlist_email_deliveries')) return [ledger.filter(job => args.length === 1 ? job.id === args[0] : job.agency_id === args[0] && job.client_id === args[1] && job.provider_id === args[2] && job.cycle_key === args[3] && job.week_number === args[4])];
    if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: lockAvailable ? 1 : 0 }]];
    if (sql.includes("SET delivery_status='sending'")) { const job = ledger.find(job => job.id === args[1]); if (job?.delivery_status !== 'pending') return [{ affectedRows: 0 }]; job.delivery_status = 'sending'; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET delivery_status='obsolete'")) { ledger.find(job => job.id === args[0]).delivery_status = 'obsolete'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE provider_waitlist_email_deliveries SET delivery_status=?')) {
      const job = ledger.find(job => job.id === args.at(-1)); job.delivery_status = args[0]; job.communication_id = args[1];
      if (sql.includes('next_attempt_at=?')) job.next_attempt_at = args[3];
      return [{ affectedRows: 1 }];
    }
    return [[{}]];
  });
  database = { execute, getConnection: async () => ({ execute, release: vi.fn() }) };
  const loadWaitlist = vi.fn(async ({ clientId, providerId }) => (clientId ? liveRows ?? rows : rows).filter(row => (!clientId || row.clientId === clientId) && (!providerId || row.providerId === providerId)));
  service = createProviderWaitlistEmailService({ database, loadWaitlist, sendEmail: send });
});

describe('provider waitlist email timing and minimal content', () => {
  it('emails clients at weeks one, two, and three, then continues staff-only follow-up', () => {
    expect(waitlistEmailWindow(base, { now: new Date(week(1).getTime() - 1) })).toBeNull();
    for (const n of [1, 2, 3]) expect(waitlistEmailWindow(base, { now: week(n) })).toMatchObject({ week: n, includeClient: true });
    expect(waitlistEmailWindow(base, { now: week(4) })).toMatchObject({ week: 4, includeClient: false, audience: 'staff', discussAlternatives: true });
    expect(waitlistEmailWindow(base, { now: week(-1) })).toBeNull();
  });
  it('deduplicates the same waitlist date whether the database returns a Date or an ISO string', () => {
    expect(waitlistEmailWindow({...base,joinedAt:new Date(base.joinedAt)},{now:week(1)}).cycleKey)
      .toBe(waitlistEmailWindow(base,{now:week(1)}).cycleKey);
  });
  it('supports explicit policy overrides and skips malformed cycles', () => {
    expect(waitlistEmailWindow(base, { now: week(4), policy: { clientWeeks: [1, 2, 3], staffAfterClientWeeks: false } })).toBeNull();
    expect(waitlistEmailWindow({ ...base, joinedAt: 'invalid' }, { now: week(1) })).toBeNull();
    expect(waitlistEmailWindow({ ...base, submissionId: null }, { now: week(1) })).toMatchObject({ week: 1, includeClient: true });
  });
  it('offers an additional-provider discussion in week three without clinical details or a promised assignment', () => {
    const row = { ...base, providerName: '<Private & Provider>', schedulingNotes: 'Clinical details must never be copied', preferredDays: ['Monday'], contact: { name: 'Private client name' } };
    const content = buildProviderWaitlistEmail(row, waitlistEmailWindow(row, { now: week(3) }), { support: 'support@tenant.test' });
    expect(content.text).toContain('discuss additional providers');
    expect(content.text).toContain('does not guarantee placement');
    expect(content.text).toContain('support@tenant.test');
    expect(content.html).toContain('&lt;Private &amp; Provider&gt;');
    expect(content.text).not.toContain(row.schedulingNotes); expect(content.text).not.toContain(row.contact.name);
    expect(buildProviderWaitlistEmail(base, waitlistEmailWindow(base, { now: week(2) }), { support: 'support@tenant.test' }).text).not.toContain('three weeks');
  });
});

describe('weekly waitlist delivery', () => {
  it('sends once per week from the configured tenant identity with support reply-to and support/provider CC', async () => {
    expect((await service.run({ now: week(1) })).sent).toBe(1);
    await service.run({ now: new Date(week(1).getTime() + 86400000) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 10, to: base.contactEmail, cc: ['support@tenant.test', base.providerEmail], replyToOverride: 'support@tenant.test', usedFallbackSender: false, templateType: 'provider_waitlist_update', intakeSubmissionId: 15 }));
    await service.run({ now: week(2) }); expect(send).toHaveBeenCalledTimes(2);
  });
  it('includes existing manual provider waitlists without an enrollment submission', async () => {
    rows[0].submissionId = null;
    await service.run({ now: week(1) }); await service.run({ now: week(1) });
    expect(send).toHaveBeenCalledTimes(1); expect(ledger[0].submission_id).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: base.contactEmail, intakeSubmissionId: null }));
    await service.run({ now: week(4) });
    expect(send.mock.calls[1][0].text).not.toContain('Enrollment reference');
  });
  it('stops client messages after the third week and still notifies support and the requested provider', async () => {
    await service.run({ now: week(4) });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'support@tenant.test', cc: [base.providerEmail], text: expect.stringContaining('initial client email series has ended') }));
  });
  it('continues an existing waitlist when the provider intake policy changes, until the active request is resolved', async () => {
    rows[0].providerClosed = true; rows[0].intakeStatusByFormat = { VIRTUAL: 'unavailable' };
    await service.run({ now: week(1) }); expect(send).toHaveBeenCalledTimes(1);
    rows[0].intakeStatusByFormat.VIRTUAL = 'accepting';
    await service.run({ now: week(2) }); expect(send).toHaveBeenCalledTimes(2);
    rows = []; await service.run({ now: week(3) }); expect(send).toHaveBeenCalledTimes(2);
  });
  it('rechecks live status so resolved, assigned, terminated, and archived records removed by the shared loader do not send', async () => {
    liveRows = [];
    expect((await service.run({ now: week(1) })).obsolete).toBe(1);
    expect(send).not.toHaveBeenCalled(); expect(ledger[0].delivery_status).toBe('obsolete');
  });
  it('never invents a sender or support address and rejects a cross-tenant identity', async () => {
    mailboxRows = [identityRows[0]];
    expect((await service.run({ now: week(1) })).retry).toBe(1); expect(send).not.toHaveBeenCalled();
    mailboxRows = identityRows.map(row => ({ ...row, agency_id: 99 }));
    await expect(resolveWaitlistMailboxes(database, 2)).rejects.toThrow('Configure this agency');
    mailboxRows = [identityRows[0], { ...identityRows[1], from_email: 'support@other.test' }];
    await expect(resolveWaitlistMailboxes(database, 2)).rejects.toThrow('Configure this agency');
  });
  it('uses default_notifications with support configured only as its reply-to', async () => {
    mailboxRows = [{ ...identityRows[0], identity_key: 'default_notifications', reply_to: 'Support@Tenant.Test' }];
    expect(await resolveWaitlistMailboxes(database, 2)).toEqual({ senderIdentityId: 10, from: 'notifications@tenant.test', support: 'support@tenant.test' });
    expect((await service.run({ now: week(1) })).sent).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 10, replyToOverride: 'support@tenant.test', cc: ['support@tenant.test', base.providerEmail] }));
  });
  it('accepts a configured notifications address regardless of key and prefers standard keys', async () => {
    mailboxRows = [{ ...identityRows[0], identity_key: 'legacy_mail', reply_to: 'support@tenant.test' }];
    expect((await resolveWaitlistMailboxes(database, 2)).senderIdentityId).toBe(10);
    mailboxRows.push({ ...mailboxRows[0], id: 12, identity_key: 'default_notifications' });
    expect((await resolveWaitlistMailboxes(database, 2)).senderIdentityId).toBe(12);
    mailboxRows.push({ ...mailboxRows[0], id: 13, identity_key: 'notifications' });
    expect((await resolveWaitlistMailboxes(database, 2)).senderIdentityId).toBe(13);
  });
  it('accepts existing support inbound addresses without requiring a support send-as identity', async () => {
    mailboxRows = [{ ...identityRows[0], inbound_addresses_json: '["support@tenant.test"]' }];
    expect((await resolveWaitlistMailboxes(database, 2)).support).toBe('support@tenant.test');
    mailboxRows[0].inbound_addresses_json = null;
    inboundRoutes = [{ agency_id: 2, is_active: 1, route_is_active: 1, email_address: 'support@tenant.test' }];
    expect((await resolveWaitlistMailboxes(database, 2)).support).toBe('support@tenant.test');
  });
  it('rejects foreign-domain reply-to and foreign-tenant or inactive inbound routes', async () => {
    mailboxRows = [{ ...identityRows[0], reply_to: 'support@other.test', inbound_addresses_json: '["support@other.test"]' },
      { ...identityRows[1], agency_id: 99 }];
    for (const override of [{ agency_id: 99 }, { is_active: 0 }, { route_is_active: 0 }, { email_address: 'support@other.test' }]) {
      inboundRoutes = [{ agency_id: 2, is_active: 1, route_is_active: 1, email_address: 'support@tenant.test', ...override }];
      await expect(resolveWaitlistMailboxes(database, 2)).rejects.toThrow('Configure this agency');
    }
    mailboxRows = [{ ...identityRows[0], agency_id: 99, reply_to: 'support@tenant.test' }];
    await expect(resolveWaitlistMailboxes(database, 2)).rejects.toThrow('Configure this agency');
  });
  it('uses staff-only email for a missing or unsafe contact address', async () => {
    rows[0].contactEmail = 'caregiver@example.test\nBcc: attacker@example.test';
    await service.run({ now: week(1) }); expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'support@tenant.test', cc: [base.providerEmail] }));
  });
  it('does not retry uncertain transport acceptance or queue a second approval request', async () => {
    send.mockRejectedValueOnce(new Error('Socket closed after request'));
    expect((await service.run({ now: week(1) })).review).toBe(1);
    await service.run({ now: new Date(week(1).getTime() + 86400000) }); expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce({ queued: true, pendingApproval: true, communicationId: 55 });
    expect((await service.run({ now: week(2) })).queued).toBe(1);
    await service.run({ now: week(2) }); expect(send).toHaveBeenCalledTimes(2);
  });
  it.each([{ blocked: true }, { skipped: true }, { id: 'testing', redirected: true }])('does not claim a blocked/redirected delivery as sent: %j', async receipt => {
    send.mockResolvedValue(receipt); const result = await service.run({ now: week(1) }); expect(result.sent).toBe(0); expect(result.held).toBe(1);
  });
  it('does not send a delivery claimed by another worker', async () => {
    lockAvailable = false;
    expect((await service.run({ now: week(1) })).busy).toBe(1); expect(send).not.toHaveBeenCalled();
  });
  it('does not starve later clients when more than the limit have already received their update', async () => {
    rows = Array.from({ length: 4 }, (_, i) => ({ ...base, id: i + 1, clientId: i + 1 }));
    for (let i = 0; i < 4; i++) expect((await service.run({ now: week(1), limit: 1 })).sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(4);
    expect(ledger.map(row => row.delivery_status)).toEqual(['sent', 'sent', 'sent', 'sent']);
  });
  it('retries preparation failures after a delay without delivering stale weeks in a burst', async () => {
    mailboxRows = []; await service.run({ now: week(1) });
    mailboxRows = identityRows; await service.run({ now: week(1) }); expect(send).not.toHaveBeenCalled();
    await service.run({ now: week(3) }); expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].text).toContain('three weeks');
  });
});
