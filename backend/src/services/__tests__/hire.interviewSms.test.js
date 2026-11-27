import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ execute: vi.fn(), getSender: vi.fn(), suppressed: vi.fn(), send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: mock.getSender, isSmsSuppressed: mock.suppressed }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: mock.send } }));

import { authorizeInterviewSms, interviewSmsProgram, prepareInterviewSmsConsent, sendPendingInterviewSmsConfirmations } from '../hiringInterviewSms.service.js';

const phone = '+12025550101';
const config = { from: '+12025550100', brandId: 'PLOTLINE', campaignId: 'INTERVIEWS' };
const sender = {
  id: 23, agency_id: 8, campaign_id: config.campaignId,
  registration: {
    provider: 'vonage', brandId: config.brandId, campaignId: config.campaignId, resellerId: 'carrier',
    brandName: 'Plotline People Operations', legalName: 'Example LLC', supportContact: 'support@example.test',
    website: 'https://example.test', privacyUrl: 'https://example.test/privacy',
    termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/evidence',
    keywordOwner: 'vonage', approved: true, numberLinked: true, interviewOnly: true, purposes: ['workforce']
  }
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ [sender.agency_id]: config }));
  mock.getSender.mockResolvedValue(sender);
  mock.suppressed.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe('Plotline interview text consent', () => {
  it('requires an approved campaign configured for this agency and dedicated to interview texts', async () => {
    expect(await interviewSmsProgram(1)).toEqual({ available: false });
    expect(await interviewSmsProgram(8)).toMatchObject({ available: true, script: expect.stringContaining('Text STOP') });
    mock.getSender.mockResolvedValue({ ...sender, campaign_id: 'other' });
    expect(await interviewSmsProgram(8)).toEqual({ available: false });
    mock.getSender.mockResolvedValue({ ...sender, registration: { ...sender.registration, interviewOnly: false } });
    expect(await interviewSmsProgram(8)).toEqual({ available: false });
  });

  it('binds the disclosure and verified phone to an affirmative, attributed opt-in', async () => {
    await expect(prepareInterviewSmsConsent(8, { phone, verbalConsent: false }, 33)).rejects.toMatchObject({ status: 400 });
    await expect(prepareInterviewSmsConsent(8, { phone, verbalConsent: true }, 33)).resolves.toMatchObject({
      phone, actorId: 33, numberId: 23, brandId: config.brandId, campaignId: config.campaignId,
      disclosure: expect.stringContaining(sender.registration.termsUrl)
    });
    mock.suppressed.mockResolvedValue(true);
    await expect(prepareInterviewSmsConsent(8, { phone, verbalConsent: true }, 33)).rejects.toMatchObject({ status: 409 });
  });

  it('requires a confirmed opt-in for this recipient and requires the interview to still permit texts', async () => {
    const consent = { phone, number_id: 23, brand_id: config.brandId, campaign_id: config.campaignId };
    mock.execute.mockResolvedValueOnce([[{ ...consent, confirmation_status: 'pending' }]]);
    await expect(authorizeInterviewSms({ sender, phone, interviewId: 19 })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
    mock.execute.mockResolvedValueOnce([[{ ...consent, phone: '+12025550102', confirmation_status: 'sent' }]]);
    await expect(authorizeInterviewSms({ sender, phone, interviewId: 19 })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
    mock.execute.mockResolvedValueOnce([[{ ...consent, confirmation_status: 'sent' }]]).mockResolvedValueOnce([[]]);
    await expect(authorizeInterviewSms({ sender, phone, interviewId: 19 })).rejects.toMatchObject({ code: 'sms_interview_reminders_disabled' });
    mock.execute.mockResolvedValueOnce([[{ ...consent, confirmation_status: 'sent' }]])
      .mockResolvedValueOnce([[{ agency_id: 8, meeting_settings_json: { interviewSmsReminders: true } }]]);
    await expect(authorizeInterviewSms({ sender, phone, interviewId: 19 })).resolves.toEqual({ agencyId: 8 });
  });
});

describe('one platform-owned Plotline interview sender', () => {
  const shared = { ...sender, phone_number: config.from, agency_id: null, number_purpose: 'platform_contact',
    registration: { ...sender.registration, platformInterviewSender: true } };
  const consent = { phone, number_id: shared.id, brand_id: config.brandId, campaign_id: config.campaignId, confirmation_status: 'sent' };
  beforeEach(() => {
    vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ platform: { ...config, scope: 'all_agencies' } }));
    mock.getSender.mockResolvedValue(shared);
  });
  it('offers the same approved program to different agencies, with explicit per-agency opt outs', async () => {
    for (const agencyId of [2, 6]) expect(await interviewSmsProgram(agencyId)).toMatchObject({ available: true });
    vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ platform: { ...config, scope: 'all_agencies' }, 6: null }));
    expect(await interviewSmsProgram(6)).toEqual({ available: false });
    expect(await interviewSmsProgram(2)).toMatchObject({ available: true });
    for (const agencyId of [null, 0, -1, 'unknown']) expect(await interviewSmsProgram(agencyId)).toEqual({ available: false });
  });
  it('requires both an explicit shared scope and a platform-owned interview registration', async () => {
    vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ platform: config }));
    expect(await interviewSmsProgram(2)).toEqual({ available: false });
    vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ platform: { ...config, scope: 'all_agencies' } }));
    for (const invalid of [
      { ...shared, agency_id: 8 }, { ...shared, number_purpose: 'clinical_care' },
      { ...shared, registration: { ...shared.registration, platformInterviewSender: false } },
      { ...shared, registration: { ...shared.registration, interviewOnly: false } }
    ]) {
      mock.getSender.mockResolvedValue(invalid);
      expect(await interviewSmsProgram(2)).toEqual({ available: false });
    }
  });
  it('binds authorization to the interview agency and retains that agency for delivery attribution', async () => {
    mock.execute.mockResolvedValueOnce([[consent]])
      .mockResolvedValueOnce([[{ agency_id: 2, meeting_settings_json: { interviewSmsReminders: true } }]]);
    await expect(authorizeInterviewSms({ sender: shared, phone, interviewId: 19, agencyId: 2 })).resolves.toEqual({ agencyId: 2 });
    expect(mock.execute.mock.calls[1][1]).toEqual([19, 2, null, null]);
    expect(mock.execute.mock.calls[1][0]).toContain('a.is_active=1');
    mock.execute.mockResolvedValueOnce([[consent]]).mockResolvedValueOnce([[]]);
    await expect(authorizeInterviewSms({ sender: shared, phone, interviewId: 19, agencyId: 6 })).rejects.toMatchObject({ code: 'sms_interview_reminders_disabled' });
  });
  it('requires an interview agency and current consent even for the shared number', async () => {
    mock.execute.mockResolvedValueOnce([[consent]]);
    await expect(authorizeInterviewSms({ sender: shared, phone, interviewId: 19 })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
    mock.execute.mockResolvedValueOnce([[{ ...consent, phone: '+12025550109' }]]);
    await expect(authorizeInterviewSms({ sender: shared, phone, interviewId: 19, agencyId: 2 })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
    mock.suppressed.mockResolvedValue(true);
    await expect(prepareInterviewSmsConsent(6, { phone, verbalConsent: true }, 33)).rejects.toMatchObject({ status: 409 });
  });
  it('continues checking the actual interview agency’s QA recipient restrictions', async () => {
    mock.execute.mockResolvedValueOnce([[consent]])
      .mockResolvedValueOnce([[{ agency_id: 450, agency_slug: 'auricwell-qa', meeting_settings_json: { interviewSmsReminders: true } }]]);
    await expect(authorizeInterviewSms({ sender: shared, phone, interviewId: 19, agencyId: 450 })).rejects.toMatchObject({ code: 'sms_qa_recipient_blocked' });
  });
  it('passes platform ownership and the interview agency separately to the SMS gate', async () => {
    mock.execute.mockResolvedValueOnce([[{ ...consent, id: 1, interview_id: 19, agency_id: 6 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]);
    mock.send.mockResolvedValue({ sid: 'synthetic-confirmation' });
    await sendPendingInterviewSmsConfirmations();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ agencyId: null, interviewAgencyId: 6,
      from: config.from, to: phone, interviewId: 19, interviewSmsConfirmation: true }));
  });
});

it('uses the interview primary-key type for the consent foreign key', () => {
  const migration = name => readFileSync(new URL(`../../../../database/migrations/${name}`, import.meta.url), 'utf8');
  const source = migration('1185_interview_hub.sql');
  const type = source.match(/CREATE TABLE IF NOT EXISTS hiring_interviews \(\s*id (\w+(?: UNSIGNED)?) AUTO_INCREMENT/)[1];
  expect(migration('1862_plotline_interview_sms_consent.sql')).toContain(`interview_id ${type} NOT NULL`);
});
