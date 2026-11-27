import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../sessionPreferenceSchedule.service.js', () => ({ refreshClientSessionNotifications: vi.fn() }));
import pool from '../../config/database.js';
import { prepareSmsDelivery } from '../smsCompliance.service.js';

const registration = {
  provider: 'vonage', brandId: 'PLOTLINE', campaignId: 'INTERVIEWS', resellerId: 'carrier',
  brandName: 'Plotline People Operations', legalName: 'Example LLC', supportContact: 'support@example.test',
  website: 'https://example.test', privacyUrl: 'https://example.test/privacy', termsUrl: 'https://example.test/terms',
  evidenceUrl: 'https://example.test/evidence', keywordOwner: 'application', approved: true, numberLinked: true,
  interviewOnly: true, platformInterviewSender: true, purposes: ['workforce']
};
const sender = { id: 23, agency_id: null, number_purpose: 'platform_contact', phone_number: '+12025550100',
  is_active: true, status: 'active', campaign_id: registration.campaignId, registration_json: registration };
const interviews = new Map([[19, { agencyId: 2, phone: '+12025550101' }], [20, { agencyId: 6, phone: '+12025550102' }]]);
let stopped;
const message = id => ({ from: sender.phone_number, to: interviews.get(id).phone, body: 'Interview reminder.',
  purpose: 'workforce', staffNotificationKind: 'plotlineInterview', agencyId: null,
  interviewId: id, interviewAgencyId: interviews.get(id).agencyId });

beforeEach(() => {
  vi.resetAllMocks();
  stopped = false;
  vi.stubEnv('PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON', JSON.stringify({ platform: {
    from: sender.phone_number, brandId: registration.brandId, campaignId: registration.campaignId, scope: 'all_agencies'
  } }));
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM twilio_numbers n LEFT JOIN agencies')) return [[sender]];
    if (sql.includes("purpose = 'suppression'")) return [stopped ? [{ exists: 1 }] : []];
    if (sql.includes('SELECT * FROM hiring_interview_sms_consents')) {
      const interview = interviews.get(args[0]);
      return [interview ? [{ phone: interview.phone, number_id: sender.id, brand_id: registration.brandId,
        campaign_id: registration.campaignId, confirmation_status: 'sent' }] : []];
    }
    if (sql.includes('FROM hiring_interviews h')) {
      const interview = interviews.get(args[0]);
      return [interview?.agencyId === args[1] ? [{ agency_id: interview.agencyId,
        meeting_settings_json: { interviewSmsReminders: true } }] : []];
    }
    return [[]];
  });
});
afterEach(() => vi.unstubAllEnvs());

it('uses one sender for two agencies and returns each actual interview agency', async () => {
  for (const id of interviews.keys()) expect(await prepareSmsDelivery(message(id))).toMatchObject({
    from: sender.phone_number, to: interviews.get(id).phone, agencyId: interviews.get(id).agencyId,
    body: expect.stringContaining('Plotline People Operations:')
  });
});
it('rejects a mismatched interview agency, recipient, and omitted agency context', async () => {
  await expect(prepareSmsDelivery({ ...message(19), interviewAgencyId: 6 })).rejects.toMatchObject({ code: 'sms_interview_reminders_disabled' });
  await expect(prepareSmsDelivery({ ...message(19), to: interviews.get(20).phone })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
  await expect(prepareSmsDelivery({ ...message(19), interviewAgencyId: undefined })).rejects.toMatchObject({ code: 'sms_interview_consent_required' });
});
it('honors campaign STOP before the interview-specific permission check', async () => {
  stopped = true;
  await expect(prepareSmsDelivery(message(19))).rejects.toMatchObject({ code: 'sms_opted_out' });
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SELECT * FROM hiring_interview_sms_consents'))).toBe(false);
});
it('keeps the shared line unavailable for ordinary workforce or clinical messages', async () => {
  await expect(prepareSmsDelivery({ ...message(19), staffNotificationKind: 'notifications' })).rejects.toMatchObject({ code: 'sms_interview_sender_restricted' });
  await expect(prepareSmsDelivery({ ...message(19), purpose: 'care' })).rejects.toMatchObject({ code: 'sms_campaign_purpose_mismatch' });
  await expect(prepareSmsDelivery({ ...message(19), agencyId: 2 })).rejects.toMatchObject({ code: 'sms_sender_agency_mismatch' });
});
