import crypto from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import { passwordRecoveryRequiresSupport, passwordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { pickRecipientEmail, resolveLoginEmail } from './passwordRecovery.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { routingDestination } from './schoolCareBridgeRouting.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const TEMPLATE = 'account_login_help';
const childTypes = new Set(['school', 'program', 'learning', 'clinical']);
const active = row => ![0, false, '0'].includes(row?.is_active) && ![0, false, '0'].includes(row?.membership_is_active)
  && ![1, true, '1'].includes(row?.is_archived);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const slug = org => String(org.portal_url || org.slug || '').trim();
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function portalProductAllowed(user) {
  if (user.status === 'EHR_ONLY') return false;
  try {
    const [[row]] = await pool.execute('SELECT identity_product FROM users WHERE id=?', [user.id]);
    return row?.identity_product === 'full_suite';
  } catch (error) {
    // Older deployments predate separate product identities. Only a missing
    // product column permits this compatibility path; storage failures propagate.
    if (error.code === 'ER_BAD_FIELD_ERROR' && String(error.message).includes('identity_product')) return true;
    throw error;
  }
}

// Use membership reads directly: User.getAgencies also repairs memberships, which
// would make a diagnostic action mutate the account being investigated.
async function memberships(userId) {
  const [rows] = await pool.execute(`SELECT a.*,ua.is_active AS membership_is_active FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=?`, [userId]);
  return rows;
}

async function context(actor, userId, agencyId) {
  if (!['super_admin', 'admin', 'support'].includes(actor?.role)) throw fail('Administrator access required.', 403);
  if (!id(userId)) throw fail('A valid user is required.');
  const organizations = await memberships(userId);
  const [affiliations] = await pool.execute(`SELECT organization_id,agency_id FROM organization_affiliations WHERE is_active=1
    UNION SELECT school_organization_id AS organization_id,agency_id FROM agency_schools WHERE is_active=1`);
  const parents = org => childTypes.has(org.organization_type)
    ? affiliations.filter(a => Number(a.organization_id) === Number(org.id)).map(a => Number(a.agency_id)) : [Number(org.id)];
  const candidates = [...new Set(organizations.flatMap(parents))];
  let tenantId = id(agencyId);
  if (agencyId != null && !tenantId) throw fail('A valid main agency is required.');
  const requestedOrg = organizations.find(a => Number(a.id) === tenantId);
  if (requestedOrg && childTypes.has(requestedOrg.organization_type)) {
    const options = [...new Set(parents(requestedOrg))];
    if (options.length !== 1) throw fail('Select the affiliated main agency for this user.');
    tenantId = options[0];
  }
  if (!tenantId && candidates.length === 1) tenantId = candidates[0];
  if (!tenantId) throw fail('Select an affiliated main agency before running login help.');
  if (!candidates.includes(tenantId)) throw fail('This user is not affiliated with the selected main agency.', 403);
  if (actor.role !== 'super_admin') {
    const actorOrgs = await memberships(actor.id);
    if (!actorOrgs.some(a => Number(a.id) === tenantId && active(a) && !childTypes.has(a.organization_type))) {
      throw fail('You can only run login help for your own main agency.', 403);
    }
  }
  const [[agency]] = await pool.execute('SELECT * FROM agencies WHERE id=?', [tenantId]);
  if (!agency || childTypes.has(agency.organization_type)) throw fail('The main agency could not be resolved.');
  return { agency, organizations, scopedOrganizations: organizations.filter(o => parents(o).includes(tenantId)) };
}

export function buildLoginHelpMessage(report, resetUrl = null) {
  const lines = [
    `Hi ${report.user.firstName || 'there'},`,
    `We reviewed your account for ${report.agency.name}. We checked your account status, affiliated portal access, sign-in method, password lockout, and available recent sign-in and session records. We did not find an account access restriction in those checks.`,
    'These checks cannot confirm what happened in your browser or rule out an intermittent service issue.',
    'Please try your portal link below:',
    ...report.loginLinks.map(link => `${link.label}: ${link.url}`),
    `Your login username is: ${report.user.username}`,
    report.signInMethod === 'google'
      ? 'Choose Continue with Google and use your organization account. Your organization requires Google sign-in; a portal password reset does not apply.'
      : 'Use your existing portal password. If you need to set or reset it, use the password link below.',
    ...(resetUrl ? [`Set / reset your password (valid for up to 48 hours): ${resetUrl}`, 'Your current password stays unchanged unless you open the link and save a new password.'] : []),
    `If you still cannot sign in, reply to this email at ${report.email.replyTo} with a screenshot, the exact error, which link you tried, and approximately when it happened. Please omit passwords and any student or client information.`,
    'Those details will help us identify the issue and help you get back into the portal.',
    `Thank you,\n${report.email.senderName}`
  ];
  const html = lines.slice(0, -1).map(line => `<p style="margin:0 0 16px;line-height:1.6;">${escape(line).replace(/https:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`)}</p>`).join('') + '<p>Thank you,</p>';
  return { subject: `Help accessing your ${report.agency.name} portal`, text: lines.join('\n\n'), html };
}

async function inspect(actor, userId, agencyId) {
  const ctx = await context(actor, userId, agencyId);
  const { agency, organizations, scopedOrganizations } = ctx;
  const [[user]] = await pool.execute(`SELECT id,first_name,last_name,username,email,work_email,personal_email,role,status,is_active,
    pending_access_locked,sso_password_override,login_is_group_email,locked_until,failed_login_attempts,
    password_hash IS NOT NULL AS has_password,temporary_password_hash IS NOT NULL AS has_temporary_password,
    temporary_password_expires_at FROM users WHERE id=?`, [Number(userId)]);
  if (!user) throw fail('User not found.', 404);
  const checks = [];
  const check = (code, status, message) => checks.push({ code, status, message });
  check('account', passwordRecoveryRequiresSupport(user) || ['PROSPECTIVE', 'EHR_ONLY'].includes(user.status) ? 'blocked' : 'ok',
    passwordRecoveryRequiresSupport(user) || ['PROSPECTIVE', 'EHR_ONLY'].includes(user.status)
      ? 'This account requires an access review. Restore the appropriate access before sending login help.' : 'Account lifecycle permits login assistance.');
  const productAllowed = await portalProductAllowed(user);
  check('product', productAllowed ? 'ok' : 'blocked', productAllowed ? 'Account belongs to this portal product.' : 'Use this account’s dedicated product sign-in.');
  if (['client', 'client_guardian', 'guardian', 'kiosk'].includes(user.role)) {
    check('special_portal', 'blocked', 'This account uses a specialized portal. Use its dedicated access workflow.');
  }
  if ([1, true, '1'].includes(user.login_is_group_email) && ![1, true, '1'].includes(user.sso_password_override)
    && ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING'].includes(user.status)) {
    check('onboarding', 'blocked', 'This group-login account must finish onboarding and activate its password through the personal onboarding portal.');
  }
  check('agency', active(agency) ? 'ok' : 'blocked', active(agency) ? 'Main agency is active.' : 'Main agency is inactive or archived.');
  const affiliated = scopedOrganizations.some(active);
  check('affiliation', affiliated ? 'ok' : 'blocked', affiliated ? 'The user has an active affiliation with this main agency.' : 'The user’s affiliations with this main agency are inactive. Review access before sending login help.');
  const policy = passwordRecoverySsoState(user, organizations);
  check('sign_in_method', 'ok', policy.ssoRequired ? 'Google sign-in is required. No password reset link will be issued.' : 'Password sign-in is available.');
  const locked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
  check('password_lockout', locked && !policy.ssoRequired ? 'blocked' : 'ok', locked && !policy.ssoRequired
    ? 'Password sign-in is currently locked. Review the lockout before sending login help.' : 'No applicable password lockout.');
  if (!policy.ssoRequired && !user.has_password) check('password_setup', 'warning', 'No lasting password is set. The help email will include a set-password link.');
  if (!policy.ssoRequired && user.has_temporary_password && new Date(user.temporary_password_expires_at).getTime() < Date.now()) {
    check('temporary_password', 'warning', 'The temporary password has expired. Use the set/reset-password link.');
  }
  if (user.failed_login_attempts > 0) check('password_attempts', 'warning', `${user.failed_login_attempts} unsuccessful password attempts recorded.`);
  const username = String(user.username || resolveLoginEmail(user) || '').trim();
  const recipient = pickRecipientEmail(user, resolveLoginEmail(user));
  check('username', username ? 'ok' : 'blocked', username ? 'Login username is configured.' : 'No login username is configured.');
  check('recipient', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient || '') ? 'ok' : 'blocked', recipient ? 'Recovery recipient is on the account.' : 'No recovery email is configured.');

  const portals = user.role === 'school_staff' ? scopedOrganizations.filter(o => o.organization_type === 'school') : [agency];
  const loginLinks = [];
  for (const org of portals.filter(active)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug(org))) continue;
    const portal = { ...org, ...(Number(org.id) !== Number(agency.id) ? { parent_portal_url: slug(agency), parent_custom_domain: agency.custom_domain } : {}) };
    loginLinks.push({ label: `${org.name} portal`, url: buildPublicAppUrl(portal, 'login') });
    if (user.role === 'school_staff') loginLinks.push({ label: `${org.name} — SchoolCareBridge`, url: routingDestination(slug(org)) });
  }
  check('portal', loginLinks.length ? 'ok' : 'blocked', loginLinks.length ? 'Affiliated login links are available.' : 'No active affiliated portal is configured.');

  let lastLoginAt = null;
  try {
    const [events] = await pool.execute(`SELECT created_at FROM user_activity_log WHERE user_id=? AND agency_id=? AND action_type='login' ORDER BY created_at DESC LIMIT 1`, [user.id, agency.id]);
    lastLoginAt = events[0]?.created_at || null;
    const [[errors]] = await pool.execute(`SELECT COUNT(DISTINCT request_id) AS count FROM security_evidence WHERE user_id=?
      AND route LIKE '/api/auth/%' AND status_code>=500 AND occurred_at>UTC_TIMESTAMP()-INTERVAL 30 MINUTE`, [user.id]);
    check('recent_errors', Number(errors?.count) ? 'blocked' : 'ok', Number(errors?.count)
      ? 'Recent server errors were recorded during authentication. Investigate before sending an account-clear email.'
      : 'No recent server errors were found in this user’s recorded authentication requests.');
    const [[sessions]] = await pool.execute(`SELECT COUNT(*) AS count FROM auth_session_security WHERE user_id=? AND revoked_at IS NULL AND locked_at IS NOT NULL`, [user.id]);
    check('sessions', Number(sessions?.count) ? 'warning' : 'ok', Number(sessions?.count) ? 'A session is locked. A fresh sign-in may be needed.' : 'No locked, unrevoked session was found.');
  } catch {
    check('history', 'unknown', 'Recent authentication history could not be checked. Retry or investigate before sending an account-clear email.');
  }
  // Account-level rate limits apply before a password is checked.
  try {
    const [aliases] = await pool.execute('SELECT email FROM user_login_emails WHERE user_id=?', [user.id]);
    const limits = new Map([...new Set([username, user.email, user.work_email, ...aliases.map(a => a.email)].filter(Boolean).map(v => String(v).trim().toLowerCase()))]
      .flatMap(v => ['identify', 'password'].map(kind => [crypto.createHash('sha256').update(`${kind}:account:${v}`).digest('hex'), kind === 'identify' ? 50 : 20])));
    const [windows] = limits.size ? await pool.query(`SELECT bucket_key,attempts FROM auth_attempt_windows WHERE bucket_key IN (?) AND expires_at>UTC_TIMESTAMP(3)`, [[...limits.keys()]]) : [[]];
    const throttled = windows.some(w => Number(w.attempts) >= limits.get(w.bucket_key));
    check('rate_limit', throttled ? 'blocked' : 'ok', throttled ? 'A recent sign-in rate-limit window needs review. Wait for it to expire before retrying.' : 'No exhausted account sign-in window found. Network-specific limits are not checked.');
  } catch { check('rate_limit', 'unknown', 'Sign-in rate-limit storage could not be checked.'); }

  const identities = await EmailSenderIdentity.list({ agencyId: agency.id, includePlatformDefaults: false, onlyActive: true });
  const identity = identities.find(i => Number(i.agency_id) === Number(agency.id) && i.identity_key === 'technology' && active(i));
  check('sender', identity?.from_email && identity?.reply_to ? 'ok' : 'blocked', identity?.from_email && identity?.reply_to
    ? 'The main agency’s Technology sender and reply address are configured.' : 'Configure a Technology sender with a reply address for this main agency.');
  const report = {
    checkedAt: new Date().toISOString(), agency: { id: agency.id, name: agency.name },
    user: { id: user.id, firstName: user.first_name, name: [user.first_name, user.last_name].filter(Boolean).join(' '), username },
    signInMethod: policy.ssoRequired ? 'google' : 'password', lastLoginAt, loginLinks, checks,
    canSend: !checks.some(c => ['blocked', 'unknown'].includes(c.status)),
    email: { to: recipient, from: identity?.from_email || null, replyTo: identity?.reply_to || null, senderName: identity?.display_name || 'Technology Team' },
    limitations: 'Checks cover stored account access and recent recorded authentication activity. They do not test the user’s password, browser, network, Google account, or live cloud-service logs.'
  };
  if (report.canSend) report.email.preview = buildLoginHelpMessage(report, policy.ssoRequired ? null : '[A private set/reset-password link will be created when sent.]').text;
  return { report, identity, agency };
}

async function recordCheck(actor, report) {
  await UserActivityLog.logActivity({ actionType: 'account_login_help_checked', userId: report.user.id, agencyId: report.agency.id,
    metadata: { performedByUserId: actor.id, checks: report.checks.map(({ code, status }) => ({ code, status })) } });
}

export async function diagnoseLoginHelp({ actor, userId, agencyId }) {
  const { report } = await inspect(actor, userId, agencyId);
  await recordCheck(actor, report);
  return report;
}

export async function sendLoginHelp({ actor, userId, agencyId }) {
  // Authorize before acquiring the account-wide lock; recheck inside it so a
  // stale browser report cannot send after account restrictions have changed.
  await context(actor, userId, agencyId);
  const connection = await pool.getConnection();
  const lock = `account-login-help:${Number(userId)}`;
  let acquired = false;
  try {
    const [[row]] = await connection.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw fail('Login help is already running for this user. Please wait.', 409);
    const { report, identity, agency } = await inspect(actor, userId, agencyId);
    await recordCheck(actor, report);
    if (!report.canSend) return { outcome: 'needs_review', report };
    const [recent] = await connection.execute(`SELECT id,delivery_status FROM user_communications WHERE user_id=? AND agency_id=?
      AND template_type=? AND delivery_status IN ('sent','delivered','pending') AND generated_at>UTC_TIMESTAMP()-INTERVAL 5 MINUTE ORDER BY id DESC LIMIT 1`, [Number(userId), agency.id, TEMPLATE]);
    if (recent.length) return { outcome: 'already_requested', communicationId: recent[0].id, report };
    let resetUrl = null;
    if (report.signInMethod !== 'google') {
      const [[existing]] = await connection.execute(`SELECT passwordless_token,passwordless_token_expires_at FROM users
        WHERE id=? AND passwordless_token_purpose='reset' AND passwordless_token_expires_at>UTC_TIMESTAMP()
        AND passwordless_token_expires_at<=UTC_TIMESTAMP()+INTERVAL 48 HOUR`, [Number(userId)]);
      const token = existing?.passwordless_token ? { token: existing.passwordless_token }
        : await User.generatePasswordlessToken(Number(userId), 48, 'reset');
      resetUrl = buildPublicAppUrl(agency, `reset-password/${token.token}`);
    }
    const message = buildLoginHelpMessage(report, resetUrl);
    const result = await sendEmailFromIdentity({ senderIdentityId: identity.id, userId: Number(userId),
      to: report.email.to, replyToOverride: report.email.replyTo, ...message, source: 'manual', templateType: TEMPLATE });
    const outcome = result?.id && !result.blocked && !result.skipped && !result.queued ? 'sent' : result?.queued ? 'queued' : 'failed';
    await UserActivityLog.logActivity({ actionType: 'account_login_help_email', userId: Number(userId), agencyId: agency.id,
      metadata: { performedByUserId: actor.id, outcome, communicationId: result?.communicationId || null, signInMethod: report.signInMethod } });
    return { outcome, communicationId: result?.communicationId || null, report };
  } finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { connection.release(); }
  }
}
