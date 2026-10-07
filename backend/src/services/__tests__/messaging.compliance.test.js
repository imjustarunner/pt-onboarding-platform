import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
import pool from '../../config/database.js';
import { prepareSmsDelivery, processSmsKeyword, recordInboundConversation } from '../smsCompliance.service.js';
import { parseSmsKeyword, validateSmsRegistration, validateSmsConsentEvidence } from '../../utils/smsCompliancePolicy.js';

const registration = {
  brandId: 'B123', campaignId: 'C123', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC',
  supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy',
  termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof',
  purposes: ['care', 'reminders'], keywordOwner: 'application', approved: true, numberLinked: true, allowRestart: true
};
const sender = { id: 3, agency_id: 2, phone_number: '+13035550100', is_active: 1, status: 'active',
  campaign_id: 'C123', registration_json: registration, agency_name: 'ITSCO' };
const message = { from: sender.phone_number, to: '+13035550101', body: 'Your appointment is tomorrow.', purpose: 'reminders' };
let permissions;
let connection;
beforeEach(() => {
  vi.resetAllMocks();
  permissions = [];
  connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, values) => {
    if (sql.includes('INSERT INTO sms_recipient_permissions')) {
      const [scope, phone, purpose, status, evidence, expires] = values;
      permissions = permissions.filter((p) => !(p.scope === scope && p.phone === phone && p.purpose === purpose));
      permissions.push({ scope, phone, purpose, status, evidence, expires_at: expires });
    }
    return [{}];
  }) };
  pool.getConnection.mockResolvedValue(connection);
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM twilio_numbers')) return [[sender]];
    if (sql.includes("purpose = 'suppression'")) return [permissions.filter((p) => [args[0], args[1]].includes(p.scope) && p.phone === args[2] && p.purpose === 'suppression' && p.status === 'opted_out')];
    if (sql.includes('FROM sms_recipient_permissions')) return [permissions.filter((p) => p.scope === args[0] && p.phone === args[1] && p.purpose === (args[2] || 'care') && p.status === 'opted_in')];
    return [[]];
  });
});

describe('campaign-wide SMS delivery gate', () => {
  it('does not grandfather a self-activated staff preference into reviewed enrollment', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: { ...registration, purposes: ['workforce'] } }]]);
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'workforce', status: 'opted_in',
      evidence_json: { reference: 'staff_communications:old-signature' } });
    await expect(prepareSmsDelivery({ ...message, purpose: 'workforce' })).rejects.toMatchObject({ code: 'sms_consent_review_required' });
  });
  it('honors separate staff categories even when workforce campaign consent exists', async () => {
    const original=pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async(sql,args)=> {
      if(sql.includes('FROM twilio_numbers')) return [[{...sender,registration_json:{...registration,purposes:['workforce','polling']}}]];
      if(sql.includes('AS choices')) return [[{choices:{phoneHash:phoneFingerprint(message.to),choices:{notifications:false,messageAlerts:true,polling:false}}}]];
      return original(sql,args);
    });
    permissions.push({scope:'campaign:C123',phone:message.to,purpose:'workforce',status:'opted_in'});
    await expect(prepareSmsDelivery({...message,purpose:'workforce'})).rejects.toMatchObject({code:'sms_staff_choice_off'});
    await expect(prepareSmsDelivery({...message,purpose:'workforce',staffNotificationKind:'messageAlerts'})).resolves.toMatchObject({to:message.to});
    await expect(prepareSmsDelivery({...message,purpose:'polling'})).rejects.toMatchObject({code:'sms_staff_choice_off'});
  });

  it('denies unregistered traffic before invoking the provider', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: null }]]);
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_campaign_not_ready' });
  });
  it('rejects a sender from a different practice', async () => {
    await expect(prepareSmsDelivery({ ...message, agencyId: 99 })).rejects.toMatchObject({ code: 'sms_sender_agency_mismatch' });
  });
  it('does not treat an existing phone or channel toggle as permission', async () => {
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('requires a declared purpose and separate marketing registration', async () => {
    await expect(prepareSmsDelivery({ ...message, purpose: undefined })).rejects.toMatchObject({ code: 'sms_campaign_purpose_mismatch' });
    await expect(prepareSmsDelivery({ ...message, purpose: 'marketing' })).rejects.toMatchObject({ code: 'sms_campaign_purpose_mismatch' });
  });
  it('normalizes phones and brands an authorized reminder', async () => {
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    expect(await prepareSmsDelivery({ ...message, to: '(303) 555-0101' })).toMatchObject({
      to: message.to, body: 'ITSCO: Your appointment is tomorrow. Reply STOP to opt out.'
    });
  });
  it('blocks staff, reminders, and care after STOP from an unknown recipient', async () => {
    const sendReply = vi.fn(async (options) => prepareSmsDelivery(options));
    expect(await processSmsKeyword({ from: message.to, to: message.from, body: 'QUIT', messageId: 'stop1', sendReply })).toBe(true);
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(permissions[0]).toMatchObject({ scope: 'campaign:C123', purpose: 'suppression', status: 'opted_out' });
    permissions.push({ scope: 'campaign:C123', phone: message.to, purpose: 'reminders', status: 'opted_in' });
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_opted_out' });
    // The suppression is shared by a second number on the same campaign.
    pool.execute.mockResolvedValueOnce([[{ ...sender, id: 4, phone_number: '+13035550102' }]]);
    await expect(prepareSmsDelivery({ ...message, from: '+13035550102' })).rejects.toMatchObject({ code: 'sms_opted_out' });
  });
  it('does not let a normal inbound text, HELP or YES clear STOP', async () => {
    await processSmsKeyword({ from: message.to, to: message.from, body: 'STOP', sendReply: vi.fn() });
    await recordInboundConversation({ from: message.to, to: message.from, messageId: 'normal' });
    await processSmsKeyword({ from: message.to, to: message.from, body: 'HELP', sendReply: vi.fn() });
    expect(await processSmsKeyword({ from: message.to, to: message.from, body: 'YES', sendReply: vi.fn() })).toBe(false);
    expect(permissions).toHaveLength(1);
    expect(permissions[0].status).toBe('opted_out');
  });
  it('bounds inbound conversation permission and never grants reminders or marketing', async () => {
    await recordInboundConversation({ from: message.to, to: message.from, messageId: 'question' });
    expect(permissions[0]).toMatchObject({ purpose: 'care', status: 'opted_in' });
    expect(permissions[0].expires_at).toBeInstanceOf(Date);
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('does not grant a new subscription from START', async () => {
    await processSmsKeyword({ from: message.to, to: message.from, body: 'START', sendReply: vi.fn() });
    await expect(prepareSmsDelivery(message)).rejects.toMatchObject({ code: 'sms_consent_required' });
  });
  it('gives HELP a real support contact, without changing subscription state', async () => {
    const sendReply = vi.fn();
    await processSmsKeyword({ from: message.to, to: message.from, body: 'INFO', sendReply });
    expect(sendReply.mock.calls[0][0].body).toContain('support@itsco.health');
    expect(permissions).toHaveLength(0);
  });
  it('does not duplicate Vonage Opt-Out Assist replies', async () => {
    pool.execute.mockResolvedValueOnce([[{ ...sender, registration_json: { ...registration, keywordOwner: 'vonage' } }]]);
    const sendReply = vi.fn();
    await processSmsKeyword({ from: message.to, to: message.from, body: 'STOP', sendReply });
    expect(sendReply).not.toHaveBeenCalled();
    expect(permissions[0].status).toBe('opted_out');
  });
  it('rejects an invented control bypass and unsupported attachments', async () => {
    await expect(prepareSmsDelivery({ ...message, complianceReply: {} })).rejects.toMatchObject({ code: 'sms_consent_required' });
    await expect(prepareSmsDelivery({ ...message, mediaUrl: ['https://example.org/file.pdf'] })).rejects.toMatchObject({ code: 'sms_mms_unsupported' });
  });
  it('fails closed when permission storage is unavailable', async () => {
    pool.execute.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(prepareSmsDelivery(message)).rejects.toThrow('Database unavailable');
  });
});

describe('submission and evidence validation', () => {
  it.each(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', ' opt out '])('handles %s before appointment routing', (text) => expect(parseSmsKeyword(text)).toBe('STOP'));
  it.each(['YES', 'Y', 'N', 'R', 'Please cancel my appointment'])('does not interpret %s as subscription consent', (text) => expect(parseSmsKeyword(text)).toBeNull());
  it('rejects missing approval, links, and mixed marketing', () => {
    expect(validateSmsRegistration(registration)).toEqual([]);
    expect(validateSmsRegistration({ ...registration, approved: false, termsUrl: '', purposes: ['care', 'marketing'] })).toHaveLength(3);
  });
  it('requires evidence rather than a manually toggled boolean', () => {
    expect(validateSmsConsentEvidence({ purpose: 'reminders', status: 'opted_in' }).length).toBeGreaterThan(0);
    expect(validateSmsConsentEvidence({ purpose: 'marketing', status: 'opted_in', evidence: {
      source: 'web_form', reference: 'submission:123', signatureReference: 'signed:123', signerVerified: true, disclosure: 'Exact displayed text', collectedAt: '2026-01-01T00:00:00Z', separateMarketingConsent: true
    } })).toEqual([]);
  });
});

it('preserves provider identity and brand after the consent check', async () => {
 permissions.push({scope:'campaign:C123',phone:message.to,purpose:'care',status:'opted_in'});
 expect(await prepareSmsDelivery({...message,purpose:'care',body:'Michael: Sounds good.',senderFirstName:'Michael'})).toMatchObject({body:'Michael: Sounds good.\nITSCO. Reply STOP to opt out.'});
});
it('a provider name does not bypass consent or STOP', async () => {
 await expect(prepareSmsDelivery({...message,purpose:'care',senderFirstName:'Michael'})).rejects.toMatchObject({code:'sms_consent_required'});
 permissions.push({scope:'campaign:C123',phone:message.to,purpose:'care',status:'opted_in'});
 await processSmsKeyword({from:message.to,to:message.from,body:'STOP',sendReply:vi.fn()});
 await expect(prepareSmsDelivery({...message,purpose:'care',senderFirstName:'Michael'})).rejects.toMatchObject({code:'sms_opted_out'});
});
