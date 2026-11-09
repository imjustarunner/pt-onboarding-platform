import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: vi.fn() }));
import { buildStaffPollEmail, pollEmailFallbackRecipient, staffPollWorkEmail } from '../staffPollEmail.service.js';
const agency = { id: 2, slug: 'itsco', feature_flags: { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] } };
const user = { id: 5, role: 'provider', is_active: 1, status: 'ACTIVE_EMPLOYEE', membership_active: 1,
  email: 'person@work.example', work_email: 'stale@work.example', personal_email: 'personal@example.net', sso_password_override: 0, login_is_group_email: 0 };
describe('SSO staff poll email fallback', () => {
  it.each(['no_phone', 'sms_opted_out', 'sms_staff_choice_off', 'sms_consent_required', 'sms_consent_review_required'])('provides work email for %s', status => {
    expect(pollEmailFallbackRecipient(user, agency, { status })).toBe(user.email);
  });
  it.each(['opted_in', 'event_sms_muted', 'sender_not_configured', 'sms_campaign_not_ready'])('does not treat %s as missing poll consent', status => {
    expect(pollEmailFallbackRecipient(user, agency, { status })).toBeNull();
  });
  it.each([{ sso_password_override: 1 }, { login_is_group_email: 1 }, { is_demo: 1 }, { is_active: 0 }, { membership_active: 0 }, { role: 'school_staff' }, { email: 'personal@example.net' }, { email: 'invalid' }])('excludes non-SSO or inactive/personal recipients %j', change => {
    expect(staffPollWorkEmail({ ...user, ...change }, agency)).toBeNull();
  });
  it('does not assume SSO when the organization has not enabled it', () => {
    expect(staffPollWorkEmail(user, { ...agency, feature_flags: {} })).toBeNull();
  });
  it('includes SSO staff whose role can use Google without being forced to use it', () => {
    expect(staffPollWorkEmail({ ...user, role: 'super_admin' }, agency)).toBe(user.email);
  });
  it('escapes authored content and links to voting and explicit consent without changing either', () => {
    const message = buildStaffPollEmail({ agency, user, event: { id: 20, title: '<Holiday party>', votingConfig: { question: 'Which <day>?', options: [{ key: '1', label: '<Tuesday>' }] } } });
    expect(message.html).toContain('&lt;Holiday party&gt;'); expect(message.html).toContain('&lt;Tuesday&gt;');
    expect(message.html).toContain('/staff-polls/20?agencyId=2');
    expect(message.html).toContain('my=preferences'); expect(message.html).toContain('#prefs-enrollment');
    expect(message.html).toContain('We promise not to spam you');
    expect(message.html).toContain('NOPOLLS');
    expect(message.html).not.toContain('responseKey=');
  });
});
