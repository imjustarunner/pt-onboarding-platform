import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), connection: { execute: vi.fn(), release: vi.fn() }, find: vi.fn(), update: vi.fn(), guardian: vi.fn(), resolve: vi.fn(), sender: vi.fn(), suppressed: vi.fn(), record: vi.fn(), send: vi.fn(), transport: vi.fn(), qa: vi.fn(), validate: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m.connection } }));
vi.mock('../../models/ClientContactAffiliation.model.js', () => ({ default: { findById: m.find, update: m.update } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 450, name: 'ITSCO', slug: 'auricwell-qa-demo' }) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ id: 1437, role: 'client_guardian', first_name: 'Taylor', last_name: 'QA' }) } }));
vi.mock('../clientContactAffiliation.service.js', () => ({ requireReminderGuardian: m.guardian }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: m.sender, resolveRegisteredSmsSender: m.resolve, isSmsSuppressed: m.suppressed, recordSmsPermission: m.record }));
vi.mock('../notifyre.service.js', () => ({ smsTransport: m.transport, sendNotifyreSms: m.send }));
vi.mock('../../utils/auricwellQaPolicy.js', () => ({ allowQaSmsDelivery: m.qa }));
vi.mock('../../utils/smsCompliancePolicy.js', () => ({ validateSmsRegistration: m.validate }));
import { contactReminderPhoneHash } from '../../utils/contactReminderConsent.js';
import { requestContactSmsInvitation, applyContactReminderSmsKeyword, contactSmsInvitationText } from '../contactReminderSmsConsent.service.js';
const input = { affiliationId: 7, clientId: 2297, userId: 1437, recipientPermissionToInvite: true };
const row = { id: 7, agency_id: 450, client_id: 2297, is_active: 1, contact_is_active: 1, sms_reminders_enabled: 1, notify_ack_at: new Date(), notify_ack_by_user_id: 1437, contact_phone: '+13035550100', sms_consent_status: 'pending', sms_consent_phone_hash: contactReminderPhoneHash('+13035550100') };
const sender = { id: 4, agency_id: 450, phone_number: '+13035550200', scope: 'campaign:C1', registration: { provider: 'notifyre', allowRestart: true } };
beforeEach(() => {
  vi.resetAllMocks();
  m.connection.execute.mockResolvedValue([[{ acquired: 1 }]]);
  m.find.mockResolvedValue({ ...row });
  m.update.mockResolvedValue({ ...row });
  m.resolve.mockResolvedValue(sender.phone_number);
  m.sender.mockResolvedValue(sender);
  m.suppressed.mockResolvedValue(false);
  m.qa.mockReturnValue(true);
  m.validate.mockReturnValue([]);
  m.transport.mockReturnValue('notifyre');
  m.send.mockResolvedValue({ sid: 'notifyre:invite1' });
  m.execute.mockResolvedValue([[]]);
});
describe('additional contact opt-in invitations', () => {
  it('requires permission for the invitation and current guardian authority', async () => {
    await expect(requestContactSmsInvitation({ ...input, recipientPermissionToInvite: false })).rejects.toMatchObject({ status: 400 });
    m.guardian.mockRejectedValueOnce(Object.assign(Error('Restricted'), { status: 403 }));
    await expect(requestContactSmsInvitation(input)).rejects.toMatchObject({ status: 403 });
    expect(m.send).not.toHaveBeenCalled();
  });
  it('sends fixed minimal text, records pending evidence, and never grants consent', async () => {
    expect(await requestContactSmsInvitation(input)).toEqual({ status: 'pending', sent: true });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 450, purpose: 'reminders', body: expect.stringContaining('Taylor QA added you') }));
    expect(m.send.mock.calls[0][0].body).toContain('Reply START');
    expect(m.send.mock.calls[0][0].body).not.toContain('2297');
    expect(m.update).toHaveBeenCalledWith(7, expect.objectContaining({ smsOptIn: false, smsConsentStatus: 'pending', smsInvitationPermissionByUserId: 1437 }));
    expect(m.record).not.toHaveBeenCalled();
    expect(m.connection.release).toHaveBeenCalled();
  });
  it.each([
    [{ sms_consent_status: 'stopped' }, 409],
    [{ sms_invitation_status: 'uncertain' }, 409],
    [{ sms_invitation_status: 'sending' }, 409],
    [{ sms_invitation_attempted_at: new Date() }, 429],
    [{ client_id: 999 }, 404],
    [{ is_active: 0 }, 404]
  ])('blocks STOP, uncertain acceptance, rapid resend and mismatched contacts (%j)', async (patch, status) => {
    m.find.mockResolvedValue({ ...row, ...patch });
    await expect(requestContactSmsInvitation(input)).rejects.toMatchObject({ status });
    expect(m.send).not.toHaveBeenCalled();
  });
  it('rechecks recipient START and STOP under the shared program lock before sending', async () => {
    m.find.mockResolvedValueOnce({ ...row }).mockResolvedValueOnce({ ...row, sms_consent_status: 'opted_in' });
    expect(await requestContactSmsInvitation(input)).toMatchObject({ status: 'opted_in', sent: false });
    expect(m.send).not.toHaveBeenCalled();
    m.find.mockReset().mockResolvedValueOnce({ ...row }).mockResolvedValueOnce({ ...row, sms_consent_status: 'stopped' });
    await expect(requestContactSmsInvitation(input)).rejects.toMatchObject({ status: 409 });
    expect(m.send).not.toHaveBeenCalled();
  });
  it('preserves campaign STOP and refuses a guardian override', async () => {
    m.suppressed.mockResolvedValue(true);
    await expect(requestContactSmsInvitation(input)).rejects.toMatchObject({ status: 409 });
    expect(m.update).toHaveBeenCalledWith(7, { smsConsentStatus: 'stopped', smsOptIn: false });
    expect(m.send).not.toHaveBeenCalled();
  });
  it.each(['campaign', 'activation', 'qa'])('reports blocked setup without sending (%s)', async kind => {
    if (kind === 'campaign') m.resolve.mockResolvedValue(null);
    if (kind === 'activation') m.transport.mockImplementation(() => { throw Object.assign(Error('Disabled'), { code: 'notifyre_not_ready' }); });
    if (kind === 'qa') m.qa.mockReturnValue(false);
    expect(await requestContactSmsInvitation(input)).toMatchObject({ status: 'blocked', sent: false });
    expect(m.send).not.toHaveBeenCalled();
  });
  it('holds uncertain sends for review instead of enabling a duplicate retry', async () => {
    m.send.mockRejectedValue(Object.assign(Error('Timeout'), { code: 'notifyre_delivery_uncertain' }));
    expect(await requestContactSmsInvitation(input)).toMatchObject({ status: 'uncertain', sent: false });
    expect(m.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ smsInvitationStatus: 'uncertain' }));
  });
  it('uses a separate own-appointments description for an adult client', () => {
    expect(contactSmsInvitationText({ agencyName: 'ITSCO', assignerName: 'Alex', isSelf: true })).toContain('their own appointments');
  });
});
describe('signed inbound START / STOP', () => {
  it('grants reminders only to scoped sent invitations and records recipient START evidence', async () => {
    m.execute.mockResolvedValue([[row]]);
    expect(await applyContactReminderSmsKeyword({ sender, phone: row.contact_phone, keyword: 'START', messageId: 'nr:reply1' })).toBe(1);
    expect(m.execute.mock.calls[0][0]).toContain('a.sms_invitation_sent_at IS NOT NULL');
    expect(m.execute.mock.calls[0][0]).toContain('cg.access_enabled=1');
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ scope: 'campaign:C1', purpose: 'reminders', status: 'opted_in', evidence: expect.objectContaining({ source: 'inbound_start_contact_invitation', messageId: 'nr:reply1' }) }));
    expect(m.update).toHaveBeenCalledWith(7, expect.objectContaining({ smsConsentStatus: 'opted_in', smsOptIn: true }));
  });
  it('never enrolls a number without a pending invitation or through the workforce carrier', async () => {
    await applyContactReminderSmsKeyword({ sender, phone: row.contact_phone, keyword: 'START' });
    expect(m.record).not.toHaveBeenCalled();
    m.execute.mockClear();
    await applyContactReminderSmsKeyword({ sender: { ...sender, registration: { provider: 'vonage' } }, phone: row.contact_phone, keyword: 'START' });
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('does not transfer an invitation to a different phone', async () => {
    m.execute.mockResolvedValue([[{ ...row, sms_consent_phone_hash: contactReminderPhoneHash('+13035550999') }]]);
    expect(await applyContactReminderSmsKeyword({ sender, phone: row.contact_phone, keyword: 'START' })).toBe(0);
    expect(m.record).not.toHaveBeenCalled();
  });
  it('clears affiliation consent on STOP without granting any new purpose', async () => {
    m.execute.mockResolvedValue([[row]]);
    await applyContactReminderSmsKeyword({ sender, phone: row.contact_phone, keyword: 'STOP', messageId: 'nr:stop' });
    expect(m.update).toHaveBeenCalledWith(7, expect.objectContaining({ smsConsentStatus: 'stopped', smsOptIn: false }));
    expect(m.record).not.toHaveBeenCalled();
  });
});
