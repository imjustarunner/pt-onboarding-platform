import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
import { createCancellationRecipientService, reviewedEmail, reviewedMessage } from '../cancellationRecipients.service.js';
import { createCancellationSchoolNoticeService } from '../cancellationSchoolNotice.service.js';
import { createReplacementOfferEventService, replacementOutcome } from '../replacementOfferEvents.service.js';

function contacts() {
  const links = [
    { guardian_user_id: 11, relationship_type: 'self', access_enabled: 1, email: 'client@example.test', phone: '+15555550111' },
    { guardian_user_id: 12, relationship_type: 'guardian', access_enabled: 1, first_name: 'Parent', email: 'parent@example.test', phone: '+15555550112' },
    { guardian_user_id: 13, relationship_type: 'guardian', access_enabled: 0, email: 'former@example.test' }
  ];
  const d = { database: { execute: vi.fn(async () => [[{ id: 8, full_name: 'Client', status: 'ACTIVE' }]]) }, guardians: async () => links,
    consent: vi.fn(async () => ({ email: true, emailAddress: 'client@example.test', phoneNumber: '+15555550111', sms:true })), preferences: vi.fn(async () => ({ isDefault: true })),
    smsConsent: vi.fn(async () => null), gate: vi.fn(async () => ({ allowed: true })), normalizePhone: v => v };
  return { d, links, service: createCancellationRecipientService(d) };
}

describe('reviewed cancellation recipients', () => {
  it('uses the chosen client/guardian scope, preserves reviewed addresses, and excludes revoked links', async () => {
    const h = contacts();
    const result = await h.service.review(8, 2, { mode: 'both', channels: ['email', 'sms'], recipients: [{ key: 'guardian:12', email: 'new@example.test' }] }, { required: true });
    expect(result.recipients.map(r => r.key)).toEqual(['client', 'guardian:12']);
    expect(result.recipients[1].email).toBe('new@example.test');
    expect(h.d.database.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=?'), [8, 2]);
    expect(h.d.smsConsent).not.toHaveBeenCalled();
  });
  it('lets staff fix a missing address in review but blocks the final review until it is supplied', async () => {
    const h = contacts(); h.links[1].email = '';
    expect((await h.service.review(8, 2)).recipients[0].email).toBe('');
    await expect(h.service.review(8, 2, null, { required: true })).rejects.toThrow('missing email');
    await expect(h.service.review(8, 2, { recipients: [{ key: 'guardian:99', email: 'outsider@example.test' }] })).rejects.toThrow('no longer linked');
  });
  it('rechecks access, per-recipient preferences, and address-specific SMS consent at delivery', async () => {
    const h = contacts(), recipient = (await h.service.review(8, 2)).recipients[0];
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(false);
    h.d.smsConsent.mockResolvedValue({ collectedAt: '2030-01-01' });
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(true);
    expect(h.d.smsConsent).toHaveBeenLastCalledWith(2, '+15555550112');
    h.d.consent.mockResolvedValueOnce({ email:true, emailAddress:'parent@example.test', phoneNumber:recipient.phone, sms:false });
    expect(await h.service.permitted(8, 2, recipient, 'sms')).toBe(false);
    h.d.preferences.mockResolvedValue({ schedulingChangesEnabled: false });
    expect(await h.service.permitted(8, 2, recipient, 'email')).toBe(false);
    h.d.preferences.mockResolvedValue({ isDefault: true }); h.links[1].access_enabled = 0;
    expect(await h.service.permitted(8, 2, recipient, 'email')).toBe(false);
  });
  it('rejects header injection and multiple addresses while retaining plain-text edits', () => {
    expect(() => reviewedEmail('one@example.test,other@example.test')).toThrow('one valid');
    expect(() => reviewedMessage({ subject: 'Hi\nBcc: someone@example.test', text: 'Cancellation' })).toThrow('subject');
    expect(reviewedMessage({ subject: 'School update', text: 'Edited reason\nNext step' })).toEqual({ subject: 'School update', text: 'Edited reason\nNext step' });
  });
});

describe('school cancellation review and delivery', () => {
  it('loads only assignments for the selected provider, agency and weekday, without sending', async () => {
    const database = { execute: vi.fn(async () => [[{ id: 21, name: 'School', provider_name: 'Provider', itsco_email: 'group@example.test', primary_contact_email: 'school@example.test' }]]) };
    const sendEmail = vi.fn(), service = createCancellationSchoolNoticeService({ database, sendEmail });
    const [school] = await service.list({ providerId: 7, agencyId: 2, date: '2030-01-02', reason: 'Unavailable' });
    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('oa.agency_id=?'), [2, 7, 'Wednesday']);
    expect(school.recipients).toEqual(['school@example.test', 'group@example.test']);
    expect(service.review(school, { recipients: ['changed@example.test', 'added@example.test'], message: { subject: 'Edited', text: 'My message' } }, true)).toMatchObject({ recipients: ['changed@example.test', 'added@example.test'], message: { subject: 'Edited', text: 'My message' } });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(() => service.review(school, { recipients: [] }, true)).toThrow('school email');
  });
  it('sends the reviewed school text separately and prevents duplicate or uncertain retries', async () => {
    const rows = new Map();
    const database = { execute: vi.fn(async (sql, p) => {
      if (sql.startsWith('INSERT IGNORE')) { if (!rows.has(p[2])) rows.set(p[2], { status: 'pending', recipient_address: p[2] }); return [{}]; }
      if (sql.includes("SET status='sending'")) { const r = rows.get(p[2]); const affectedRows = ['pending', 'failed'].includes(r.status) ? 1 : 0; if (affectedRows) r.status = 'sending'; return [{ affectedRows }]; }
      if (sql.startsWith('UPDATE')) { Object.assign(rows.get(p[6]), { status: p[0], error_message: p[1] }); return [{}]; }
      if (sql.startsWith('SELECT')) return [[rows.get(p[2])]];
      throw new Error(sql);
    }) };
    const sendEmail = vi.fn().mockResolvedValueOnce({ id: 'accepted' }).mockRejectedValueOnce(new Error('Connection lost'));
    const service = createCancellationSchoolNoticeService({ database, sendEmail });
    const item = { key: 'school:2:21:2030-01-02', agencyId: 2, recipients: ['school@example.test', 'extra@example.test'], message: { subject: 'Edited subject', text: 'Edited message <safe>' } };
    const first = await service.send('token', item, 7); await service.send('token', item, 7);
    expect(first).toMatchObject({ sent: 1, held: 1 }); expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'school@example.test', subject: 'Edited subject', text: 'Edited message <safe>', html: '<p>Edited message &lt;safe&gt;</p>' });
    expect(rows.get('extra@example.test').status).toBe('review');
  });
});

describe('rescheduling outcome documentation', () => {
  it('distinguishes automatic booking, legacy denial, confirmed booking, and no response with or without a next session', () => {
    expect(replacementOutcome('requested')).toContain('being booked automatically');
    expect(replacementOutcome('confirmed', null, 22)).toContain('confirmed and scheduled (appointment #22)');
    expect(replacementOutcome('declined_by_team')).toContain('requested session denied');
    expect(replacementOutcome('expired', { displayWhen: 'Thursday' })).toContain('no response; next session scheduled for Thursday');
    expect(replacementOutcome('expired')).toContain('no next session is currently scheduled');
  });
  it('records outcomes in the caller’s transaction and notifies the provider only after confirmation', async () => {
    const connection = { execute: vi.fn() };
    const service = createReplacementOfferEventService();
    await service.record({ id: 8 }, 'requested', connection);
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE'), [8, 'requested', expect.stringContaining('reschedule requested'), 'suppressed']);
    await service.record({ id: 8, linked_appointment_id: 22 }, 'confirmed', connection);
    expect(connection.execute).toHaveBeenLastCalledWith(expect.any(String), [8, 'confirmed', expect.stringContaining('#22'), 'pending']);
  });
});
