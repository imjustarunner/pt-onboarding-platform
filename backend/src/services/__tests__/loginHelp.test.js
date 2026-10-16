import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const m = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), connection: vi.fn(), lock: vi.fn(), release: vi.fn(),
  token: vi.fn(), send: vi.fn(), identities: vi.fn(), audit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, query: m.query, getConnection: m.connection } }));
vi.mock('../../models/User.model.js', () => ({ default: { generatePasswordlessToken: m.token } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: m.identities } }));
vi.mock('../../models/UserActivityLog.model.js', () => ({ default: { logActivity: m.audit } }));
vi.mock('../passwordRecovery.service.js', () => ({
  pickRecipientEmail: user => user.personal_email || user.work_email || user.email,
  resolveLoginEmail: user => user.work_email || user.email
}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
import { diagnoseLoginHelp, sendLoginHelp, buildLoginHelpMessage } from '../loginHelp.service.js';

const actor = { id: 1, role: 'admin' };
let tenant, school, user, actorOrgs, userOrgs, affiliations, recent, existing, errorCount, sessionCount, historyFailure, rateWindows;
const args = () => ({ actor, userId: 42, agencyId: 2 });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCHOOLCAREBRIDGE_PUBLIC_ORIGIN = 'https://schoolcarebridge.org';
  tenant = { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency', is_active: 1 };
  school = { id: 440, name: 'Bradley', slug: 'bradley', organization_type: 'school', is_active: 1 };
  user = { id: 42, first_name: 'Jill', last_name: 'Camacho', email: 'jill@school.example', work_email: 'jill@school.example',
    username: 'jill@school.example', role: 'school_staff', status: 'ACTIVE_EMPLOYEE', is_active: 1, has_password: 1, failed_login_attempts: 0 };
  actorOrgs = [tenant]; userOrgs = [tenant, school]; affiliations = [{ organization_id: 440, agency_id: 2 }];
  recent = []; existing = []; errorCount = 0; sessionCount = 0; historyFailure = false; rateWindows = [];
  m.identities.mockResolvedValue([{ id: 7, agency_id: 2, identity_key: 'technology', display_name: 'ITSCO Technology Team',
    from_email: 'technology@itsco.health', reply_to: 'technology@itsco.health', is_active: 1 }]);
  m.token.mockResolvedValue({ token: 'PRIVATE-RESET-TOKEN' });
  m.send.mockResolvedValue({ id: 'sent-id', communicationId: 72 });
  m.audit.mockResolvedValue({ id: 1 });
  m.query.mockImplementation(async sql => {
    if (sql.includes('auth_attempt_windows')) return [rateWindows];
    throw new Error(`Unexpected query: ${sql}`);
  });
  m.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM user_agencies')) return [params[0] === 1 ? actorOrgs : userOrgs];
    if (sql.includes('FROM organization_affiliations')) return [affiliations];
    if (sql === 'SELECT * FROM agencies WHERE id=?') return [[tenant]];
    if (sql.includes('has_password') && sql.includes('FROM users')) return [[{ ...user }]];
    if (sql.startsWith('SELECT identity_product')) return [[{ identity_product: 'full_suite' }]];
    if (sql.includes('FROM user_activity_log')) { if (historyFailure) throw new Error('storage offline'); return [[{ created_at: '2026-10-09T03:59:47Z' }]]; }
    if (sql.includes('FROM security_evidence')) return [[{ count: errorCount }]];
    if (sql.includes('FROM auth_session_security')) return [[{ count: sessionCount }]];
    if (sql.includes('FROM user_login_emails')) return [[]];
    throw new Error(`Unexpected execute: ${sql}`);
  });
  m.connection.mockResolvedValue({ execute: m.lock, release: m.release });
  m.lock.mockImplementation(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.includes('FROM user_communications')) return [recent];
    if (sql.includes('passwordless_token')) return [existing];
    throw new Error(`Unexpected lock query: ${sql}`);
  });
});

describe('tenant-scoped login diagnosis', () => {
  it('supports schemas before product identities were introduced', async () => {
    const original = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, params) => {
      if (sql.startsWith('SELECT identity_product')) throw Object.assign(new Error("Unknown column 'identity_product'"), { code: 'ER_BAD_FIELD_ERROR' });
      return original(sql, params);
    });
    expect((await diagnoseLoginHelp(args())).canSend).toBe(true);
  });
  it('does not treat product-storage failures as a clean diagnosis', async () => {
    const original = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, params) => {
      if (sql.startsWith('SELECT identity_product')) throw new Error('Database unavailable');
      return original(sql, params);
    });
    await expect(sendLoginHelp(args())).rejects.toThrow('Database unavailable');
    expect(m.token).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('blocks identities assigned to another product', async () => {
    const original = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, params) => sql.startsWith('SELECT identity_product')
      ? [[{ identity_product: 'ehr' }]] : original(sql, params));
    expect((await sendLoginHelp(args())).outcome).toBe('needs_review');
    expect(m.token).not.toHaveBeenCalled();
  });
  it('checks an active school account and resolves both school links without generating credentials', async () => {
    const report = await diagnoseLoginHelp(args());
    expect(report).toMatchObject({ canSend: true, signInMethod: 'password', agency: { id: 2 }, user: { username: user.work_email } });
    expect(report.loginLinks.map(l => l.url)).toEqual(['https://app.itsco.health/bradley/login', 'https://schoolcarebridge.org/app/bradley']);
    expect(report.email.preview).toContain('did not find an account access restriction');
    expect(report.email.preview).toContain('cannot confirm what happened in your browser');
    expect(m.token).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toMatch(/password_hash|PRIVATE-RESET-TOKEN|personal_email/);
  });
  it('resolves a school selection to its affiliated main agency', async () => {
    const report = await diagnoseLoginHelp({ ...args(), agencyId: 440 });
    expect(report.agency.id).toBe(2);
  });
  it('denies an actor from another main agency before reading credentials or audit history', async () => {
    actorOrgs = [{ id: 9, organization_type: 'agency', is_active: 1 }];
    await expect(diagnoseLoginHelp(args())).rejects.toMatchObject({ status: 403 });
    expect(m.execute.mock.calls.some(([sql]) => sql.includes('has_password'))).toBe(false);
    expect(m.identities).not.toHaveBeenCalled();
  });
  it('does not treat school-only membership as main-agency administrative authority', async () => {
    actorOrgs = [school];
    await expect(sendLoginHelp(args())).rejects.toMatchObject({ status: 403 });
    expect(m.connection).not.toHaveBeenCalled();
  });
  it('does not authorize an administrator with an inactive main-agency membership', async () => {
    actorOrgs = [{ ...tenant, membership_is_active: 0 }];
    await expect(sendLoginHelp(args())).rejects.toMatchObject({ status: 403 });
    expect(m.token).not.toHaveBeenCalled();
  });
  it('reports inactive target affiliations without sending email', async () => {
    userOrgs = userOrgs.map(org => ({ ...org, membership_is_active: 0 }));
    const result = await sendLoginHelp(args());
    expect(result.outcome).toBe('needs_review');
    expect(result.report.checks).toContainEqual(expect.objectContaining({ code: 'affiliation', status: 'blocked' }));
    expect(m.send).not.toHaveBeenCalled();
  });
  it('denies an unrelated agency even for superadmins', async () => {
    await expect(diagnoseLoginHelp({ ...args(), actor: { id: 1, role: 'super_admin' }, agencyId: 9 })).rejects.toMatchObject({ status: 403 });
  });
  it('requires a selection when the account has several main agencies', async () => {
    userOrgs.push({ id: 9, organization_type: 'agency' });
    await expect(diagnoseLoginHelp({ ...args(), agencyId: undefined })).rejects.toThrow('Select an affiliated main agency');
  });
  it('never includes another agency’s schools or sender', async () => {
    userOrgs.push({ id: 500, name: 'Other school', slug: 'other', organization_type: 'school' });
    affiliations.push({ organization_id: 500, agency_id: 9 });
    m.identities.mockResolvedValue([{ id: 90, agency_id: 9, identity_key: 'technology', from_email: 'technology@other.example', reply_to: 'technology@other.example' }]);
    const report = await diagnoseLoginHelp(args());
    expect(report.canSend).toBe(false);
    expect(report.loginLinks).toHaveLength(2);
    expect(report.email.from).toBeNull();
  });
  it.each([{ status: 'ARCHIVED' }, { status: 'PROSPECTIVE' }, { is_active: 0 }, { pending_access_locked: 1 }, { locked_until: '2099-01-01' }])('blocks restricted accounts: %j', async restriction => {
    Object.assign(user, restriction);
    expect((await sendLoginHelp(args())).outcome).toBe('needs_review');
    expect(m.token).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('blocks unfinished group onboarding without replacing its personal portal token', async () => {
    Object.assign(user, { status: 'ONBOARDING', login_is_group_email: 1 });
    expect((await sendLoginHelp(args())).outcome).toBe('needs_review'); expect(m.token).not.toHaveBeenCalled();
  });
  it('does not claim a clean account when history is unavailable', async () => {
    historyFailure = true;
    const result = await sendLoginHelp(args());
    expect(result.outcome).toBe('needs_review'); expect(result.report.checks).toContainEqual(expect.objectContaining({ status: 'unknown' }));
    expect(m.send).not.toHaveBeenCalled();
  });
  it('blocks an automatic clear-account email when recent server errors exist', async () => {
    errorCount = 2;
    expect((await sendLoginHelp(args())).outcome).toBe('needs_review'); expect(m.token).not.toHaveBeenCalled();
  });
  it('checks the correct rate-limit threshold for identify requests', async () => {
    const key = crypto.createHash('sha256').update(`identify:account:${user.username}`).digest('hex');
    rateWindows = [{ bucket_key: key, attempts: 21 }];
    expect((await diagnoseLoginHelp(args())).canSend).toBe(true);
    rateWindows[0].attempts = 50;
    expect((await diagnoseLoginHelp(args())).canSend).toBe(false);
  });
});

describe('login-help delivery', () => {
  it('sends one branded department email with recovery instructions and no credential in the response or audit', async () => {
    const result = await sendLoginHelp(args());
    expect(result.outcome).toBe('sent');
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 7, source: 'manual', to: user.work_email,
      replyToOverride: 'technology@itsco.health', templateType: 'account_login_help',
      text: expect.stringContaining('https://app.itsco.health/reset-password/PRIVATE-RESET-TOKEN') }));
    expect(m.send.mock.calls[0][0].cc).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE-RESET-TOKEN');
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain('PRIVATE-RESET-TOKEN');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('uses the established personal recovery inbox while retaining the real login username', async () => {
    user.personal_email = 'recovery@example.net';
    await sendLoginHelp(args());
    expect(m.send.mock.calls[0][0]).toMatchObject({ to: user.personal_email, text: expect.stringContaining(user.username) });
  });
  it('sends Google guidance without creating or exposing a password reset for SSO accounts', async () => {
    user.role = 'provider'; tenant.feature_flags = { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] };
    const result = await sendLoginHelp(args());
    expect(result.outcome).toBe('sent'); expect(m.token).not.toHaveBeenCalled();
    expect(m.send.mock.calls[0][0].text).toContain('Choose Continue with Google');
    expect(m.send.mock.calls[0][0].text).not.toContain('/reset-password/');
  });
  it('reuses an unexpired reset token', async () => {
    existing = [{ passwordless_token: 'EXISTING-PRIVATE' }];
    await sendLoginHelp(args()); expect(m.token).not.toHaveBeenCalled();
    expect(m.send.mock.calls[0][0].text).toContain('/reset-password/EXISTING-PRIVATE');
  });
  it('rechecks account restrictions after a previous clean diagnosis', async () => {
    expect((await diagnoseLoginHelp(args())).canSend).toBe(true);
    user.is_active = 0;
    expect((await sendLoginHelp(args())).outcome).toBe('needs_review'); expect(m.token).not.toHaveBeenCalled();
  });
  it('deduplicates recent sent or pending help before minting a reset token', async () => {
    recent = [{ id: 72, delivery_status: 'sent' }];
    expect((await sendLoginHelp(args())).outcome).toBe('already_requested');
    expect(m.token).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('rejects concurrent sends', async () => {
    m.lock.mockResolvedValue([[{ acquired: 0 }]]);
    await expect(sendLoginHelp(args())).rejects.toMatchObject({ status: 409 });
    expect(m.token).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalled();
  });
  it.each([[{ queued: true, communicationId: 72 }, 'queued'], [{ blocked: true }, 'failed'], [{ skipped: true }, 'failed']])('reports delivery truthfully: %j', async (delivery, outcome) => {
    m.send.mockResolvedValue(delivery);
    expect((await sendLoginHelp(args())).outcome).toBe(outcome);
  });
  it('releases the send lock after a provider failure', async () => {
    m.send.mockRejectedValue(new Error('provider unavailable'));
    await expect(sendLoginHelp(args())).rejects.toThrow('provider unavailable');
    expect(m.lock.mock.calls.at(-1)[0]).toContain('RELEASE_LOCK'); expect(m.release).toHaveBeenCalledOnce();
  });
  it('escapes user-supplied text in the email', async () => {
    const report = await diagnoseLoginHelp(args()); report.user.firstName = '<script>alert(1)</script>';
    expect(buildLoginHelpMessage(report).html).not.toContain('<script>');
  });
});
