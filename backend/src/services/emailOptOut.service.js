/**
 * Email opt-out: account prefs, school-staff group delivery mute, support ticket.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import UserPreferences from '../models/UserPreferences.model.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { applySchoolGroupSubscription, resolveGroupEmailForSchool } from './schoolGroupSubscription.service.js';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function isEmailOptedOut({ email, agencyId = null } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  try {
    if (agencyId) {
      const [rows] = await pool.execute(
        `SELECT id FROM email_opt_outs
         WHERE email = ? AND (agency_id = ? OR agency_id IS NULL)
         LIMIT 1`,
        [normalized, Number(agencyId)]
      );
      if (rows?.length) return true;
    } else {
      const [rows] = await pool.execute(
        `SELECT id FROM email_opt_outs WHERE email = ? LIMIT 1`,
        [normalized]
      );
      if (rows?.length) return true;
    }
  } catch (e) {
    console.warn('[emailOptOut] isEmailOptedOut lookup failed:', e?.message || e);
  }

  try {
    const [users] = await pool.execute(
      `SELECT u.id
       FROM users u
       WHERE LOWER(u.email) = ? OR LOWER(COALESCE(u.work_email, '')) = ? OR LOWER(COALESCE(u.personal_email, '')) = ?
       LIMIT 1`,
      [normalized, normalized, normalized]
    );
    const userId = Number(users?.[0]?.id || 0);
    if (!userId) return false;
    const prefs = await UserPreferences.findByUserId(userId);
    if (prefs && (prefs.email_enabled === 0 || prefs.email_enabled === false)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function resolveOptOutToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token || token.length < 16) return null;
  const tokenHash = sha256(token);
  const [rows] = await pool.execute(
    `SELECT t.*, a.name AS agency_name
     FROM email_opt_out_tokens t
     LEFT JOIN agencies a ON a.id = t.agency_id
     WHERE t.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows?.[0] || null;
  if (!row) return null;
  if (row.used_at) return { ...row, expired: true, reason: 'already_used' };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ...row, expired: true, reason: 'expired' };
  }
  return { ...row, expired: false };
}

async function resolveUserForEmail(email) {
  const normalized = normalizeEmail(email);
  const [rows] = await pool.execute(
    `SELECT id, role, first_name, last_name, email, agency_id
     FROM users
     WHERE LOWER(email) = ? OR LOWER(COALESCE(work_email, '')) = ? OR LOWER(COALESCE(personal_email, '')) = ?
     LIMIT 1`,
    [normalized, normalized, normalized]
  );
  return rows?.[0] || null;
}

async function createOptOutSupportTicket({ email, agencyId, userId, user, schoolOrgId = null }) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || email;
  const role = String(user?.role || '').trim() || 'unknown';
  const subject = `Email opt-out — ${name}`.slice(0, 255);
  const question = [
    'A recipient opted out of emails via the email footer link.',
    '',
    `Email: ${email}`,
    `User id: ${userId || '—'}`,
    `Role: ${role}`,
    `Agency id: ${agencyId || '—'}`,
    `School org id: ${schoolOrgId || '—'}`,
    '',
    role === 'school_staff'
      ? 'School staff: group email subscription set to No email; Google Group membership and portal access kept.'
      : 'Account email preference set to opted out.'
  ].join('\n');

  const qEnc = prepareEncryptedTicketText(question);
  const orgId = Number(schoolOrgId || agencyId || 0) || null;
  if (!orgId) return null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, agency_id,
         subject, question, status, source_channel, source_email_from, topic,
         question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
       VALUES (?, NULL, ?, ?, ?, ?, 'open', 'email_opt_out', ?, 'communications', ?, ?, ?, ?)`,
      [
        orgId,
        userId || null,
        agencyId || orgId,
        subject,
        qEnc.plain,
        email,
        qEnc.ciphertext,
        qEnc.iv,
        qEnc.authTag,
        qEnc.keyId
      ]
    );
    return result?.insertId || null;
  } catch (e) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
         VALUES (?, NULL, ?, ?, ?, ?, 'open')`,
        [orgId, userId || null, agencyId || orgId, subject, qEnc.plain || question]
      );
      return result?.insertId || null;
    } catch (e2) {
      console.warn('[emailOptOut] ticket create failed:', e2?.message || e2 || e?.message);
      return null;
    }
  }
}

/**
 * Apply opt-out from a valid public token.
 */
export async function applyEmailOptOutFromToken(rawToken, { source = 'email_link' } = {}) {
  const row = await resolveOptOutToken(rawToken);
  if (!row || row.expired) {
    const err = new Error(row?.reason === 'already_used' ? 'This opt-out link was already used.' : 'This opt-out link is invalid or expired.');
    err.status = 400;
    err.code = row?.reason || 'invalid_token';
    throw err;
  }

  const email = normalizeEmail(row.email);
  const agencyId = row.agency_id ? Number(row.agency_id) : null;
  const user = await resolveUserForEmail(email);
  const userId = Number(row.user_id || user?.id || 0) || null;
  const role = String(user?.role || '').toLowerCase();

  let schoolOrgId = null;
  if (role === 'school_staff' || !user) {
    try {
      const [sc] = await pool.execute(
        `SELECT school_organization_id FROM school_contacts WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
        [email]
      );
      schoolOrgId = Number(sc?.[0]?.school_organization_id || 0) || null;
    } catch {
      /* ignore */
    }
  }

  const mutedGroups = [];
  const isSchoolStaffRecipient = role === 'school_staff' || !!schoolOrgId;

  if (isSchoolStaffRecipient) {
    const orgIds = new Set();
    if (schoolOrgId) orgIds.add(schoolOrgId);
    try {
      const [contacts] = await pool.execute(
        `SELECT school_organization_id FROM school_contacts WHERE LOWER(TRIM(email)) = ?`,
        [email]
      );
      for (const c of contacts || []) {
        const id = Number(c.school_organization_id || 0);
        if (id) orgIds.add(id);
      }
    } catch {
      /* ignore */
    }
    if (!orgIds.size && userId) {
      try {
        const [orgs] = await pool.execute(
          `SELECT ua.agency_id
           FROM user_agencies ua
           INNER JOIN agencies a ON a.id = ua.agency_id
           WHERE ua.user_id = ?
             AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'program', 'learning')`,
          [userId]
        );
        for (const o of orgs || []) {
          const id = Number(o.agency_id || 0);
          if (id) orgIds.add(id);
        }
      } catch {
        /* ignore */
      }
    }
    for (const orgId of orgIds) {
      const result = await applySchoolGroupSubscription({
        schoolOrganizationId: orgId,
        email,
        subscription: 'none',
        source: source || 'email_link',
        actorUserId: userId,
        displayName: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || null,
        notify: true
      });
      if (result?.groupEmail) mutedGroups.push(result.groupEmail);
    }

    await pool.execute(
      `UPDATE email_opt_out_tokens SET used_at = NOW() WHERE id = ?`,
      [row.id]
    );

    return {
      ok: true,
      email,
      agencyId,
      userId,
      role: role || 'school_staff',
      schoolStaffMutedGroups: mutedGroups,
      supportTicketId: null,
      keptGroupMembership: true,
      groupEmail: mutedGroups[0] || (await resolveGroupEmailForSchool(schoolOrgId)) || null,
      subscription: 'none'
    };
  }

  if (userId) {
    try {
      await UserPreferences.update(userId, { email_enabled: false });
    } catch (e) {
      console.warn('[emailOptOut] preferences update failed:', e?.message || e);
    }
  }

  const ticketId = await createOptOutSupportTicket({
    email,
    agencyId,
    userId,
    user,
    schoolOrgId
  });

  await pool.execute(
    `INSERT INTO email_opt_outs (email, agency_id, user_id, source, support_ticket_id, opted_out_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       opted_out_at = VALUES(opted_out_at),
       source = VALUES(source),
       user_id = COALESCE(VALUES(user_id), user_id),
       support_ticket_id = COALESCE(VALUES(support_ticket_id), support_ticket_id)`,
    [email, agencyId, userId, source, ticketId]
  );

  await pool.execute(
    `UPDATE email_opt_out_tokens SET used_at = NOW() WHERE id = ?`,
    [row.id]
  );

  return {
    ok: true,
    email,
    agencyId,
    userId,
    role: role || null,
    schoolStaffMutedGroups: mutedGroups,
    supportTicketId: ticketId,
    keptGroupMembership: mutedGroups.length > 0 || role === 'school_staff'
  };
}
