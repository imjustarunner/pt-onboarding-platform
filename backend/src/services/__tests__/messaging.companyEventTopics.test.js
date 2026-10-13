import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), isSmsSuppressed: vi.fn(), prepareSmsDelivery: vi.fn() }));
vi.mock('../smsConsentRequest.service.js', () => ({ createSmsConsentRequest: vi.fn() }));
import pool from '../../config/database.js';
import { getSmsSender, isSmsSuppressed, prepareSmsDelivery } from '../smsCompliance.service.js';
import { createSmsConsentRequest } from '../smsConsentRequest.service.js';
import { assertCompanyEventSmsCampaign, buildCompanyEventSms, parseCompanyEventSmsCommand, selectCompanyEventSmsReply, normalizeCompanyEventDeliveryStatus } from '../../utils/companyEventSms.js';
import { handleCompanyEventTopicInbound, sendCompanyEventSms, recordCompanyEventSmsDeliveryStatus, listCompanyEventSmsAttendees, companyEventParticipantSmsAudience, enrollCompanyEventGuestSms, getCompanyEventSmsTopic } from '../companyEventSms.service.js';
const registration = { brandId: 'B123', campaignId: 'C2', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy', termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof', purposes: ['polling', 'workforce'], keywordOwner: 'application', approved: true, numberLinked: true };
const sender = { id: 8, agency_id: 2, campaign_id: 'C2', scope: 'campaign:C2', phone_number: '+13035550100', registration };
const delivery = { id: 20, code: 112, company_event_id: 4, agency_id: 2, user_id: 7, title: 'School fair', purpose: 'polling', dispatch_type: 'recruitment' };
const incoming = { from: '+13035550101', to: sender.phone_number, body: 'Y', messageId: 'incoming-1' };
beforeEach(() => { vi.resetAllMocks(); getSmsSender.mockResolvedValue(sender); isSmsSuppressed.mockResolvedValue(false); prepareSmsDelivery.mockResolvedValue({}); });

describe('event SMS command boundaries', () => {
  it('reserves campaign control keywords and leaves unrelated care text alone', () => {
    for (const value of ['STOP', 'cancel', 'REVOKE', 'OPT OUT', 'HELP', 'START', 'Please call me', 'R']) expect(parseCompanyEventSmsCommand(value)).toBeNull();
  });
  it('accepts event-only mute codes and explicit replies in either order', () => {
    expect(parseCompanyEventSmsCommand('112')).toEqual({ type: 'mute', code: '112' });
    for (const value of ['Y 112', '112 YES']) expect(parseCompanyEventSmsCommand(value)).toEqual({ type: 'interest', code: '112', response: 'Y' });
    expect(parseCompanyEventSmsCommand('112 N')).toEqual({ type: 'interest', code: '112', response: 'N' });
    expect(parseCompanyEventSmsCommand('1')).toBeNull();
  });
  it('requires a code for overlapping invitations and keeps newest delivery context', () => {
    const other = { ...delivery, company_event_id: 5, code: 113 };
    expect(selectCompanyEventSmsReply([delivery, other], { code: null })).toEqual({ ambiguous: true, codes: ['112', '113'] });
    expect(selectCompanyEventSmsReply([delivery, { ...delivery, id: 19 }], { code: null }).id).toBe(20);
    expect(selectCompanyEventSmsReply([delivery, other], { code: '113' }).company_event_id).toBe(5);
  });
  it('states interest needs approval and separates event mute from campaign STOP', () => {
    const text = buildCompanyEventSms({ event: { title: 'School fair', starts_at: '2026-10-24T18:00:00Z', ends_at: '2026-10-24T20:00:00Z', timezone: 'America/Denver' }, code: '112', brandName: 'ITSCO', mode: 'recruitment' });
    expect(text).toContain('October 24'); expect(text).toContain('organizer approval required');
    expect(text).toContain('Reply 112 to turn off texts about this event'); expect(text).toContain("STOP to opt out of ITSCO's Employee Texting");
  });
});

describe('event campaign isolation', () => {
  it('requires the dedicated staff campaign for every employee event purpose', () => {
    expect(assertCompanyEventSmsCampaign(sender, 'staff', 'workforce')).toBe(2);
    expect(() => assertCompanyEventSmsCampaign({ registration: { ...registration, purposes: ['care', 'workforce'] } }, 'staff', 'workforce')).toThrow('Campaign 2');
    expect(() => assertCompanyEventSmsCampaign(sender, 'participant', 'reminders')).toThrow('Campaign 1');
  });
  it('accepts registered service reminders and never routes them to polling', () => {
    expect(assertCompanyEventSmsCampaign({ registration: { ...registration, purposes: ['care', 'reminders'] } }, 'participant', 'reminders')).toBe(1);
    expect(() => assertCompanyEventSmsCampaign({ registration: { ...registration, approved: false } })).toThrow('approved');
  });
  it('routes enrolled Skill Builders and program guests to service communications while staff remain separate', () => {
    expect(companyEventParticipantSmsAudience({ event_type: 'skills_group' })).toBe('participant');
    expect(companyEventParticipantSmsAudience({ eventType: 'program_workshop' })).toBe('participant');
    expect(companyEventParticipantSmsAudience({ event_type: 'company_event' })).toBe('staff');
  });
});

describe('event inbound persistence', () => {
  it('mutes only the referenced event and never changes campaign consent', async () => {
    pool.execute.mockResolvedValueOnce([[delivery]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const reply = vi.fn().mockRejectedValue(new Error('Recipient already STOPped'));
    const result = await handleCompanyEventTopicInbound({ ...incoming, body: '112', sendReply: reply });
    expect(result).toMatchObject({ handled: true, muted: true, eventId: 4 });
    expect(pool.execute.mock.calls[0][1]).toEqual([2, incoming.from, 'C2', '112']);
    expect(pool.execute.mock.calls[1][1]).toEqual([4, incoming.from, incoming.messageId]);
    expect(pool.execute.mock.calls.map(([sql]) => sql).join(' ')).not.toContain('sms_recipient_permissions');
  });
  it('does not consume an unknown numeric code', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await handleCompanyEventTopicInbound({ ...incoming, body: '999' })).toBeNull();
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
  it('records Y as interest without any assignment or approval writes', async () => {
    pool.execute.mockResolvedValueOnce([[delivery]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 7 }]]).mockResolvedValue([{ affectedRows: 1 }]);
    const result = await handleCompanyEventTopicInbound(incoming);
    expect(result.responseMessage).toContain('You are not assigned');
    const sql = pool.execute.mock.calls.map(([query]) => query).join('\n');
    expect(sql).toContain('INSERT INTO company_event_responses');
    expect(sql).not.toMatch(/INSERT INTO company_event_session_providers|INSERT INTO company_event_session_provider_requests|status = 'approved'/);
    expect(pool.execute.mock.calls.at(-1)[1]).toEqual(['Y', 20]);
  });
  it('suppresses muted event responses and does not re-enroll on Y', async () => {
    pool.execute.mockResolvedValueOnce([[delivery]]).mockResolvedValueOnce([[{ 1: 1 }]]);
    expect(await handleCompanyEventTopicInbound(incoming)).toEqual({ handled: true });
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });
  it('campaign STOP wins over interest', async () => {
    pool.execute.mockResolvedValueOnce([[delivery]]); isSmsSuppressed.mockResolvedValue(true);
    expect(await handleCompanyEventTopicInbound(incoming)).toEqual({ handled: true });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
  it('never guesses an event for an ambiguous Y', async () => {
    pool.execute.mockResolvedValueOnce([[delivery, { ...delivery, company_event_id: 5, code: 113 }]]);
    const result = await handleCompanyEventTopicInbound(incoming);
    expect(result.responseMessage).toContain('112, 113'); expect(pool.execute).toHaveBeenCalledTimes(1);
  });
  it('passes known poll replies to the existing configurable poll handler', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...delivery, dispatch_type: 'vote_invite' }]]).mockResolvedValueOnce([[]]);
    expect(await handleCompanyEventTopicInbound({ ...incoming, body: 'Y 112' })).toEqual({ handled: false, eventId: 4, response: 'Y' });
  });
  it('consumes a closed event reply without falling through to another open poll', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...delivery, voting_closed_at: '2026-01-01' }]]).mockResolvedValueOnce([[]]);
    const result = await handleCompanyEventTopicInbound({ ...incoming, body: 'Y 112' });
    expect(result).toMatchObject({ handled: true, eventId: 4 });
    expect(result.responseMessage).toContain('no longer accepting');
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });
  it('does not attribute a shared phone to whichever staff account was last messaged', async () => {
    pool.execute.mockResolvedValueOnce([[delivery, { ...delivery, user_id: 8 }]]).mockResolvedValueOnce([[]]);
    const result = await handleCompanyEventTopicInbound(incoming);
    expect(result.responseMessage).toContain('shared'); expect(pool.execute).toHaveBeenCalledTimes(2);
  });
});

describe('guarded delivery and reporting', () => {
  it('reuses an existing topic without consuming another code', async () => {
    pool.execute.mockResolvedValueOnce([[{ code: 112 }]]);
    expect(await getCompanyEventSmsTopic(4, 2)).toBe('112');
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
  function stubDelivery() {
    pool.execute.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT * FROM company_events')) return [[{ id: 4, agency_id: 2, title: 'School fair', is_active: 1 }]];
      if (sql.startsWith('SELECT feature_flags')) return [[{ feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true } }]];
      if (sql.startsWith('SELECT code')) return [[{ code: 112 }]];
      return [{ insertId: 30 }];
    });
  }
  it('checks suppression before transport, records a skipped send and retains event context', async () => {
    stubDelivery(); prepareSmsDelivery.mockRejectedValue(Object.assign(new Error('muted'), { status: 403, code: 'event_sms_muted' }));
    const send = vi.fn();
    await expect(sendCompanyEventSms({ eventId: 4, agencyId: 2, userId: 7, from: sender.phone_number, to: incoming.from, body: 'Reminder' }, { send })).rejects.toMatchObject({ code: 'event_sms_muted' });
    expect(send).not.toHaveBeenCalled();
    expect(prepareSmsDelivery).toHaveBeenCalledWith(expect.objectContaining({ companyEventId: 4, agencyId: 2, purpose: 'workforce' }));
    expect(pool.execute.mock.calls.at(-1)[1]).toEqual(['skipped', 'event_sms_muted', 30]);
  });
  it('saves provider receipt ID and hands event context to the guarded transport', async () => {
    stubDelivery(); const send = vi.fn().mockResolvedValue({ sid: 'outbound-1' });
    await sendCompanyEventSms({ eventId: 4, agencyId: 2, userId: 7, from: sender.phone_number, to: incoming.from, body: 'Reminder' }, { send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ companyEventId: 4, from: sender.phone_number }));
    expect(pool.execute.mock.calls.at(-1)[1]).toEqual(['outbound-1', 30]);
  });
  it('does not repeat a reminder or duplicate a shared phone within the same campaign batch', async () => {
    stubDelivery(); const original = pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async (sql, args) => {
      if (sql.startsWith('INSERT INTO company_event_sms_deliveries')) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return original(sql, args);
    });
    const send = vi.fn();
    await expect(sendCompanyEventSms({ eventId: 4, agencyId: 2, userId: 7, from: sender.phone_number, to: incoming.from, body: 'Reminder', batchId: 'same-occurrence' }, { send })).rejects.toMatchObject({ code: 'event_sms_already_attempted' });
    expect(send).not.toHaveBeenCalled(); expect(prepareSmsDelivery).not.toHaveBeenCalled();
  });
  it('maps carrier status and prevents late accepted receipts undoing final outcomes', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(normalizeCompanyEventDeliveryStatus('accepted')).toBe('sent');
    expect(normalizeCompanyEventDeliveryStatus('delivered')).toBe('delivered');
    expect(normalizeCompanyEventDeliveryStatus('rejected')).toBe('failed');
    await recordCompanyEventSmsDeliveryStatus('outbound-1', 'accepted');
    expect(pool.execute.mock.calls[0][0]).toContain("status NOT IN ('failed', 'skipped')");
    expect(pool.execute.mock.calls[0][0]).toContain("status <> 'delivered'");
  });
  it('does not transfer previous event consent to an edited phone number', async () => {
    pool.execute.mockResolvedValueOnce([[{ operations_json: { attendeeSmsEnabled: true } }]]).mockResolvedValueOnce([[
      { id: 1, phone: '+13035550111', consent_phone: '+13035550101' },
      { id: 2, phone: '+13035550102', consent_phone: '+13035550102' }
    ]]);
    expect(await listCompanyEventSmsAttendees(4, 2)).toEqual([expect.objectContaining({ id: 2 })]);
  });
});

describe('event signup consent handoff', () => {
  function stubEnrollment() {
    pool.execute.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT * FROM company_events')) return [[{ id: 4, agency_id: 2, event_type: 'company_event', operations_json: { attendeeSmsEnabled: true } }]];
      if (sql.includes('FROM company_event_guest_registrations')) return [[{ id: 9, phone: incoming.from }]];
      if (sql.startsWith('SELECT feature_flags')) return [[{ feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true, companyEventsSenderNumberId: 8 } }]];
      if (sql.startsWith('SELECT phone_number')) return [[{ phone_number: sender.phone_number }]];
      if (sql.startsWith('SELECT 1')) return [[]];
      return [{ affectedRows: 1 }];
    });
  }
  const enrollment = { eventId: 4, agencyId: 2, guestRegistrationId: 9, phone: incoming.from, evidence: { consented: true } };
  it('sends new recipients to the existing signature and review workflow without granting permission or sending texts', async () => {
    stubEnrollment(); prepareSmsDelivery.mockRejectedValue(Object.assign(new Error('signature required'), { code: 'sms_consent_required' }));
    createSmsConsentRequest.mockResolvedValue({ id: 31, path: '/sms-consent/sign#secret' });
    expect(await enrollCompanyEventGuestSms(enrollment)).toMatchObject({ status: 'pending_review', consentRequestId: 31, consentPath: '/sms-consent/sign#secret' });
    expect(createSmsConsentRequest).toHaveBeenCalledWith({ agencyId: 2, numberId: 8, phone: incoming.from, signerRole: 'staff', actorUserId: null });
    expect(pool.execute.mock.calls.map(([sql]) => sql).join(' ')).not.toContain('INSERT INTO sms_recipient_permissions');
  });
  it('does not issue a signing request that could reopen campaign STOP', async () => {
    stubEnrollment(); isSmsSuppressed.mockResolvedValue(true);
    expect(await enrollCompanyEventGuestSms(enrollment)).toMatchObject({ status: 'suppressed', consentPath: null });
    expect(createSmsConsentRequest).not.toHaveBeenCalled();
  });
  it('reuses valid reviewed campaign permission while recording the separate event choice', async () => {
    stubEnrollment();
    expect(await enrollCompanyEventGuestSms(enrollment)).toMatchObject({ status: 'active' });
    expect(createSmsConsentRequest).not.toHaveBeenCalled();
  });
});
