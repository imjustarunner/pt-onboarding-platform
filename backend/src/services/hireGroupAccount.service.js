/**
 * Hire account mode: Google Group work email + app password (SSO override).
 * Used when agency.feature_flags.hireAccountMode === 'group_password'.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';
import { ensurePersonalMailboxForAddress } from './personalMailbox.service.js';

const parseJsonObject = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw || fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeNamePart = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const resolveWorkspaceFormat = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'first_initial_last';
  if (['first', 'first_name', 'firstname'].includes(v)) return 'first';
  if (['first_last', 'first.last', 'firstdotlast'].includes(v)) return 'first_last';
  if (['first_initial_last', 'firstinitiallast', 'flast'].includes(v)) return 'first_initial_last';
  if (['last_first_initial', 'lastfirstinitial', 'lastf'].includes(v)) return 'last_first_initial';
  return 'first_initial_last';
};

export const resolveWorkspaceDomain = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  return v.startsWith('@') ? v.slice(1) : v;
};

export function isGroupPasswordHireMode(agency) {
  const flags = parseJsonObject(agency?.feature_flags, {});
  return String(flags.hireAccountMode || '').trim().toLowerCase() === 'group_password';
}

function buildLocalParts({ first, last, format }) {
  const f = first || 'user';
  const l = last || 'hire';
  // Prefer the simplest local-part first (eden@) before longer variants.
  const candidates = [f];
  if (format === 'first') {
    candidates.push(`${f}${l[0] || ''}`, `${f}.${l}`);
  } else if (format === 'first_last') {
    candidates.push(`${f}.${l}`, `${f}${l}`);
  } else if (format === 'last_first_initial') {
    candidates.push(`${l}${f[0] || ''}`, `${l}.${f}`, `${f}.${l}`);
  } else {
    candidates.push(`${f[0] || ''}${l}`, `${f}.${l}`, `${f}${l}`);
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function isAppEmailTaken(email, excludeUserId = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  const existing = await User.findByEmail(normalized);
  if (existing && Number(existing.id) !== Number(excludeUserId || 0)) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT user_id FROM user_login_emails WHERE LOWER(email) = ? LIMIT 1`,
      [normalized]
    );
    if (rows?.[0]?.user_id && Number(rows[0].user_id) !== Number(excludeUserId || 0)) return true;
  } catch {
    /* table may not exist */
  }
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM users WHERE LOWER(TRIM(username)) = ? LIMIT 1`,
      [normalized]
    );
    if (rows?.[0]?.id && Number(rows[0].id) !== Number(excludeUserId || 0)) return true;
  } catch {
    /* username column may not exist */
  }
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM email_inbound_routes WHERE LOWER(TRIM(email_address)) = ? AND is_active = 1 LIMIT 1`,
      [normalized]
    );
    if (rows?.[0]?.id) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Suggest available @domain addresses for a hire (app + Directory users/groups).
 */
export async function suggestHireWorkEmails({ user, agency, limit = 8 } = {}) {
  const flags = parseJsonObject(agency?.feature_flags, {});
  const domain =
    resolveWorkspaceDomain(flags.workspaceEmailDomain) ||
    resolveWorkspaceDomain(agency?.workspace_email_domain) ||
    'itsco.health';
  const format = resolveWorkspaceFormat(flags.workspaceEmailFormat);
  const first = normalizeNamePart(user?.first_name);
  const last = normalizeNamePart(user?.last_name);
  const locals = buildLocalParts({ first, last, format });
  const suggestions = [];
  const directoryConfigured = GoogleWorkspaceDirectoryService.isConfigured();

  for (const local of locals) {
    if (suggestions.length >= limit) break;
    const email = `${local}@${domain}`;
    const appTaken = await isAppEmailTaken(email, user?.id);
    if (appTaken) continue;
    let directoryAvailable = true;
    if (directoryConfigured) {
      try {
        directoryAvailable = await GoogleWorkspaceDirectoryService.isDirectoryEmailAvailable(email);
      } catch (e) {
        console.warn('[hireGroupAccount] directory availability check failed:', e?.message || e);
        directoryAvailable = true; // allow suggest; confirm will re-check
      }
    }
    if (!directoryAvailable) continue;
    suggestions.push({ email, local, domain, available: true });
  }

  // Numeric suffixes on primary local
  if (suggestions.length < limit && locals[0]) {
    for (let i = 1; i < 50 && suggestions.length < limit; i += 1) {
      const email = `${locals[0]}${i}@${domain}`;
      if (await isAppEmailTaken(email, user?.id)) continue;
      let ok = true;
      if (directoryConfigured) {
        try {
          ok = await GoogleWorkspaceDirectoryService.isDirectoryEmailAvailable(email);
        } catch {
          ok = true;
        }
      }
      if (ok) suggestions.push({ email, local: `${locals[0]}${i}`, domain, available: true });
    }
  }

  return {
    domain,
    format,
    hireAccountMode: 'group_password',
    suggestions,
    directoryConfigured
  };
}

export async function checkHireWorkEmailAvailability({ email, userId = null, agency = null } = {}) {
  const normalized = normalizeEmail(email);
  const flags = parseJsonObject(agency?.feature_flags, {});
  const domain =
    resolveWorkspaceDomain(flags.workspaceEmailDomain) ||
    resolveWorkspaceDomain(agency?.workspace_email_domain) ||
    'itsco.health';

  if (!normalized || !normalized.includes('@')) {
    return { available: false, reason: 'invalid_email', email: normalized };
  }
  const atDomain = normalized.split('@')[1];
  if (atDomain !== domain) {
    return { available: false, reason: 'wrong_domain', email: normalized, expectedDomain: domain };
  }
  if (await isAppEmailTaken(normalized, userId)) {
    return { available: false, reason: 'taken_in_app', email: normalized };
  }
  if (GoogleWorkspaceDirectoryService.isConfigured()) {
    try {
      const free = await GoogleWorkspaceDirectoryService.isDirectoryEmailAvailable(normalized);
      if (!free) {
        return {
          available: false,
          reason: 'taken_in_directory',
          email: normalized,
          message: 'That address is already used by a Google user or group.'
        };
      }
    } catch (e) {
      return { available: false, reason: 'directory_error', message: e?.message || String(e), email: normalized };
    }
  }
  return { available: true, email: normalized, domain };
}

const HIRE_GROUP_ACCESS_SETTINGS = {
  allowExternalMembers: true,
  whoCanJoin: 'CAN_REQUEST_TO_JOIN',
  whoCanViewMembership: 'ALL_IN_DOMAIN_CAN_VIEW',
  whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
  whoCanPostMessage: 'ANYONE_CAN_POST',
  whoCanModerateMembers: 'OWNERS_AND_MANAGERS',
  includeInGlobalAddressList: true,
  isArchived: true,
  messageModerationLevel: 'MODERATE_NONE',
  spamModerationLevel: 'MODERATE'
};

/**
 * Create Google Group at work email, set app password + SSO override, skip Workspace user.
 * Group email becomes app username; personal email is password recovery; anyone can post.
 */
export async function provisionHireGroupAccount({
  user,
  agency,
  workEmail,
  password,
  displayName = null
} = {}) {
  if (!user?.id) throw new Error('User is required');
  if (!agency) throw new Error('Agency is required');
  if (!isGroupPasswordHireMode(agency)) {
    throw new Error('Agency is not configured for group_password hire accounts');
  }

  const pwd = String(password || '');
  if (pwd.length < 8) throw new Error('Password must be at least 8 characters');

  const availability = await checkHireWorkEmailAvailability({
    email: workEmail,
    userId: user.id,
    agency
  });
  if (!availability.available) {
    const err = new Error(`Work email is not available (${availability.reason || 'unavailable'})`);
    err.code = 'EMAIL_UNAVAILABLE';
    err.details = availability;
    throw err;
  }

  const email = availability.email;
  const personalEmail = normalizeEmail(user.personal_email || user.email);
  if (!personalEmail || !personalEmail.includes('@') || personalEmail === email) {
    const err = new Error(
      'A personal email is required for password recovery before creating the group work email.'
    );
    err.code = 'PERSONAL_EMAIL_REQUIRED';
    throw err;
  }

  const name =
    String(displayName || '').trim() ||
    `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() ||
    email.split('@')[0];

  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    throw new Error('Google Workspace Directory is not configured for group provisioning');
  }

  // Create group (or reuse if somehow exists and was free in race — getGroup after insert conflict)
  let group = null;
  try {
    group = await GoogleWorkspaceDirectoryService.createGroup({
      email,
      name: `${name} (hire)`.slice(0, 73),
      description: `Hire mailbox for ${name} — PlotTwistHQ group_password path. External senders may post; mail is delivered to the app inbox.`,
      whoCanPostMessage: 'ANYONE_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      allowExternalMembers: true,
      isArchived: true,
      messageModerationLevel: 'MODERATE_NONE',
      spamModerationLevel: 'MODERATE'
    });
  } catch (e) {
    const status = e?.code || e?.response?.status || null;
    if (status === 409) {
      group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail: email });
      if (!group) throw e;
    } else {
      throw e;
    }
  }

  // Groups Settings API is authoritative for "Anyone on the web" posting.
  try {
    await GoogleWorkspaceDirectoryService.applyGroupAccessSettings({
      groupEmail: email,
      ...HIRE_GROUP_ACCESS_SETTINGS
    });
  } catch (settingsErr) {
    console.warn(
      '[hireGroupAccount] applyGroupAccessSettings failed (posting may be restricted):',
      settingsErr?.message || settingsErr
    );
  }

  try {
    await GoogleWorkspaceDirectoryService.addGroupMember({
      groupEmail: email,
      memberEmail: personalEmail,
      role: 'OWNER'
    });
  } catch (memberErr) {
    console.warn('[hireGroupAccount] add personal email to group failed:', memberErr?.message || memberErr);
  }
  // Polled mailbox (ai@ owns schoolreply aliases) must receive group mail for app ingest.
  try {
    await GoogleWorkspaceDirectoryService.addGroupMember({
      groupEmail: email,
      memberEmail: 'ai@plottwistco.com',
      role: 'MANAGER'
    });
  } catch (managerErr) {
    console.warn('[hireGroupAccount] add AI manager to group failed:', managerErr?.message || managerErr);
  }

  // Persist: group email = login username; personal email = recovery; SSO password override on.
  await pool.execute('UPDATE users SET personal_email = ? WHERE id = ?', [personalEmail, user.id]);
  await User.setWorkEmail(user.id, email);
  try {
    await pool.execute(
      `UPDATE users
       SET email = ?,
           username = ?,
           sso_password_override = 1,
           login_is_group_email = 1
       WHERE id = ?`,
      [email, email, user.id]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      try {
        await pool.execute(
          `UPDATE users SET email = ?, username = ?, sso_password_override = 1 WHERE id = ?`,
          [email, email, user.id]
        );
      } catch (e2) {
        if (e2?.code === 'ER_BAD_FIELD_ERROR') {
          await pool.execute(
            `UPDATE users SET email = ?, sso_password_override = 1 WHERE id = ?`,
            [email, user.id]
          );
        } else {
          throw e2;
        }
      }
    } else {
      throw e;
    }
  }

  // App password (login with group username — Google SSO forced-off via override)
  await User.changePassword(user.id, pwd);

  // Keep personal email as login alias + recovery target (not primary username)
  try {
    await pool.execute(
      `INSERT IGNORE INTO user_login_emails (user_id, email, is_primary, source)
       VALUES (?, ?, 0, 'hire_group_personal')`,
      [user.id, personalEmail]
    );
  } catch {
    try {
      await pool.execute(
        `INSERT IGNORE INTO user_login_emails (user_id, email) VALUES (?, ?)`,
        [user.id, personalEmail]
      );
    } catch {
      /* ignore */
    }
  }

  // Wire group address into personal My Inbox + inbound routes for the email agent.
  let personalInbox = null;
  try {
    personalInbox = await ensurePersonalMailboxForAddress({
      agencyId: agency.id,
      userId: user.id,
      fromEmail: email,
      displayName: name
    });
  } catch (inboxErr) {
    console.warn('[hireGroupAccount] personal mailbox wiring failed:', inboxErr?.message || inboxErr);
  }

  return {
    workEmail: email,
    groupEmail: email,
    username: email,
    groupId: group?.id || null,
    ssoPasswordOverride: true,
    personalEmail,
    recoveryEmail: personalEmail,
    whoCanPostMessage: 'ANYONE_CAN_POST',
    personalInboxId: personalInbox?.id || null
  };
}

export default {
  isGroupPasswordHireMode,
  suggestHireWorkEmails,
  checkHireWorkEmailAvailability,
  provisionHireGroupAccount
};
