import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ find: vi.fn(), byId: vi.fn(), agencies: vi.fn(), token: vi.fn(), send: vi.fn(), identities: vi.fn(), log: vi.fn(), template: vi.fn(), parent: vi.fn(), agency: vi.fn(), execute: vi.fn(), audit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail: m.find, findById: m.byId, getAgencies: m.agencies, generatePasswordlessToken: m.token } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: { getActiveAgencyIdForSchool: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency, findBySlug: vi.fn(), findByPortalUrl: vi.fn() } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: m.identities } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: m.parent } }));
vi.mock('../emailTemplate.service.js', () => ({ default: { buildResetTokenLink: (agency, token) => `https://${agency.slug}.example/reset-password/${token}`, getTemplateForAgency: m.template, collectParameters: async () => ({}), renderTemplate: (t) => t } }));
vi.mock('../communicationLogging.service.js', () => ({ default: { logGeneratedCommunication: m.log, markAsSent: vi.fn().mockResolvedValue() } }));
vi.mock('../activityLog.service.js', () => ({ default: { logActivity: m.audit } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../../utils/hogwartsTestEmail.js', () => ({ looksLikeTestInboxRedirectAddress: () => false, shouldRedirectHogwartsOutboundEmail: async () => false }));
import { requestPasswordRecoveryEmail } from '../passwordRecovery.service.js';
import { passwordRecoverySsoState, passwordResetRequiresSignIn } from '../passwordRecoveryPolicy.service.js';
const tenant = { id: 9, slug: 'tenant', organization_type: 'agency', feature_flags: { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] } };
let user;
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: 42, email: 'eric@school.example', role: 'school_staff', status: 'PENDING_SETUP', password_hash: null };
  m.find.mockImplementation(async () => user); m.byId.mockImplementation(async () => user);
  m.agencies.mockResolvedValue([tenant]); m.token.mockResolvedValue({ token: 'reset-token' });
  m.send.mockResolvedValue({ id: 'message-id' }); m.log.mockResolvedValue({ id: 7 }); m.execute.mockResolvedValue([]);
  m.identities.mockResolvedValue([{ id: 12, agency_id: 9, from_email: 'app@tenant.example' }]); m.template.mockResolvedValue(null);
});
describe('password recovery delivery', () => {
  it.each(['PENDING_SETUP', 'PREHIRE_OPEN', 'ACTIVE_EMPLOYEE', 'ARCHIVED', 'inactive'])('emails a school account at stage %s', async (status) => {
    user.status = status;
    expect((await requestPasswordRecoveryEmail({ email: user.email })).outcome).toBe('sent');
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, senderIdentityId: 12, replyToOverride: 'technology@tenant.example', templateType: 'password_reset', html: expect.stringContaining('https://tenant.example/reset-password/reset-token') }));
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 9 }));
  });
  it('uses a personal inbox for non-SSO employees and preserves the login email', async () => {
    Object.assign(user, { role: 'provider', sso_password_override: 1, personal_email: 'personal@example.net' });
    await requestPasswordRecoveryEmail({ email: user.email });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: user.personal_email, text: expect.stringContaining(user.email) }));
  });
  it('blocks SSO before generating a token or sending mail', async () => {
    user.role = 'provider';
    expect((await requestPasswordRecoveryEmail({ email: user.email })).outcome).toBe('sso_required');
    expect(m.token).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('does not bypass SSO when policy lookup fails', async () => {
    m.agencies.mockRejectedValue(new Error('unavailable'));
    await expect(requestPasswordRecoveryEmail({ email: user.email })).rejects.toThrow('unavailable');
    expect(m.token).not.toHaveBeenCalled();
  });
  it('uses the parent tenant for school branding and sender', async () => {
    m.agencies.mockResolvedValue([{ id: 20, organization_type: 'school' }]); m.parent.mockResolvedValue(9); m.agency.mockResolvedValue(tenant);
    await requestPasswordRecoveryEmail({ email: user.email });
    expect(m.identities).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 9, includePlatformDefaults: false }));
  });
  it('does not report a queued or blocked email as sent', async () => {
    m.send.mockResolvedValue({ queued: true, id: 'queue-id' });
    expect((await requestPasswordRecoveryEmail({ email: user.email })).outcome).toBe('failed');
  });
  it('does not fall back to another tenant sender', async () => {
    m.identities.mockResolvedValue([{ id: 12, agency_id: 2, from_email: 'app@other.example' }]);
    expect((await requestPasswordRecoveryEmail({ email: user.email })).outcome).toBe('failed');
    expect(m.send).not.toHaveBeenCalled();
  });
  it('always includes a working reset link even if a saved template omits it', async () => {
    m.template.mockResolvedValue({ body: 'Hello', subject: 'Account access' });
    await requestPasswordRecoveryEmail({ email: user.email });
    expect(m.send.mock.calls[0][0].text).toContain('https://tenant.example/reset-password/reset-token');
    expect(m.send.mock.calls[0][0].text).toContain('You can ignore this email');
    expect(m.send.mock.calls[0][0].html).toContain('open the link and save a new password');
  });
  it('uses the exact profile target and existing token for an admin email', async () => {
    await requestPasswordRecoveryEmail({ targetUser: user, existingTokenResult: { token: 'admin-token' }, generatedByUserId: 3 });
    expect(m.find).not.toHaveBeenCalled(); expect(m.token).not.toHaveBeenCalled();
    expect(m.send.mock.calls[0][0].html).toContain('/reset-password/admin-token');
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ generatedByUserId: 3 }));
  });
  it('records who requested the email, tenant, recipient, sender, and successful delivery', async () => {
    const req = { user: { id: 3, first_name: 'Pat', last_name: 'Admin', email: 'pat@tenant.example' }, originalUrl: '/api/school-portal/20/school-staff/42/issue-reset-link' };
    await requestPasswordRecoveryEmail({ targetUser: user, generatedByUserId: 3, req });
    expect(m.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actionType: 'password_reset_link_sent', userId: 42, agencyId: 9,
      metadata: expect.objectContaining({ performedByUserId: 3, performedByName: 'Pat Admin', performedByEmail: 'pat@tenant.example', requestSource: 'school_portal', email: user.email, deliveryStatus: 'sent', fromEmail: 'app@tenant.example', replyTo: 'technology@tenant.example', communicationId: 7 })
    }), req);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain('reset-token');
  });
  it('audits a send failure without recording a successful send or exposing the token', async () => {
    m.send.mockRejectedValue(new Error('Send failed reset-token'));
    await requestPasswordRecoveryEmail({ email: user.email });
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit.mock.calls[0][0]).toMatchObject({ actionType: 'password_reset_email_failed', agencyId: 9, metadata: { deliveryStatus: 'failed', requestSource: 'public_forgot_password', performedByUserId: null } });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain('reset-token');
  });
  it('keeps unknown addresses private and sends nothing', async () => {
    m.find.mockResolvedValue(null);
    expect((await requestPasswordRecoveryEmail({ email: 'unknown@example.net' })).outcome).toBe('unknown_user'); expect(m.send).not.toHaveBeenCalled();
  });
});
describe('recovery SSO and account restrictions', () => {
  it('recognizes aliased provider roles and explicit password exceptions', () => {
    const orgs = [{ feature_flags: JSON.stringify({ googleSsoEnabled: true, googleSsoRequiredRoles: ['provider_plus'] }) }];
    expect(passwordRecoverySsoState({ role: 'clinical_practice_assistant' }, orgs).ssoRequired).toBe(true);
    expect(passwordRecoverySsoState({ role: 'clinical_practice_assistant', sso_password_override: '1' }, orgs).ssoRequired).toBe(false);
  });
  it.each([{ status: 'ARCHIVED' }, { status: 'inactive' }, { is_archived: '1' }, { pending_access_locked: 1 }])('preserves access restrictions for %j', (u) => {
    expect(passwordResetRequiresSignIn(u)).toBe(true);
  });
});
