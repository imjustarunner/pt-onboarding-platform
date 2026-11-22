import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ execute: vi.fn(), getSender: vi.fn(), suppressed: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: mock.getSender, isSmsSuppressed: mock.suppressed }));

import { authorizeInterviewSms, interviewSmsProgram, prepareInterviewSmsConsent } from '../hiringInterviewSms.service.js';

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
      .mockResolvedValueOnce([[{ meeting_settings_json: { interviewSmsReminders: true } }]]);
    await expect(authorizeInterviewSms({ sender, phone, interviewId: 19 })).resolves.toBeUndefined();
  });
});
