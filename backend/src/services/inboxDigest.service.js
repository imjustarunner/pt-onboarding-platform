import pool from '../config/database.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

const DEFAULT_DIGEST_HOURS = 48;

function normalizeDigestHours(v) {
  const n = Number(v);
  return n === 24 ? 24 : 48;
}

export async function getCommunicationPrefs(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows[0]) {
    return {
      userId,
      personalEmailNotify: !!rows[0].personal_email_notify,
      digestHours: normalizeDigestHours(rows[0].digest_hours),
      lastInboxDigestAt: rows[0].last_inbox_digest_at || null
    };
  }
  return {
    userId,
    personalEmailNotify: false,
    digestHours: DEFAULT_DIGEST_HOURS,
    lastInboxDigestAt: null
  };
}

export async function updateCommunicationPrefs(userId, patch = {}) {
  const current = await getCommunicationPrefs(userId);
  const personalEmailNotify =
    patch.personalEmailNotify !== undefined ? !!patch.personalEmailNotify : current.personalEmailNotify;
  const digestHours =
    patch.digestHours !== undefined ? normalizeDigestHours(patch.digestHours) : current.digestHours;

  await pool.execute(
    `INSERT INTO user_communication_prefs (user_id, personal_email_notify, digest_hours)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       personal_email_notify = VALUES(personal_email_notify),
       digest_hours = VALUES(digest_hours)`,
    [userId, personalEmailNotify ? 1 : 0, digestHours]
  );
  return getCommunicationPrefs(userId);
}

/**
 * Send delayed digests to opted-in users for stale Needs Reply / Follow Up conversations.
 * Bypass rules (assigned high/urgent) are handled by including those sooner via urgencyHours.
 */
export async function runInboxDigestTick({ now = new Date() } = {}) {
  const [prefsRows] = await pool.execute(
    `SELECT p.user_id, p.digest_hours, p.last_inbox_digest_at,
            u.personal_email, u.email, u.first_name,
            (
              SELECT ua.agency_id FROM user_agencies ua
              WHERE ua.user_id = u.id AND (ua.is_active = 1 OR ua.is_active IS NULL)
              ORDER BY ua.id ASC LIMIT 1
            ) AS agency_id
     FROM user_communication_prefs p
     JOIN users u ON u.id = p.user_id
     WHERE p.personal_email_notify = 1
       AND u.status = 'active'
       AND (u.personal_email IS NOT NULL AND TRIM(u.personal_email) <> '')`
  );

  let sent = 0;
  for (const row of prefsRows || []) {
    const hours = normalizeDigestHours(row.digest_hours);
    const to = String(row.personal_email || '').trim();
    if (!to) continue;

    // Throttle: at most one digest per digest_hours window
    if (row.last_inbox_digest_at) {
      const last = new Date(row.last_inbox_digest_at);
      if (now - last < hours * 60 * 60 * 1000 * 0.9) continue;
    }

    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const urgentCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000); // high/urgent: 2h

    const [convs] = await pool.execute(
      `SELECT c.id, c.subject, c.status, c.priority, c.last_message_at, c.due_at, c.agency_id
       FROM communication_conversations c
       WHERE c.archived_at IS NULL
         AND c.status IN ('new', 'needs_reply', 'follow_up')
         AND (c.owner_user_id = ? OR c.owner_user_id IS NULL)
         AND (
           (c.priority IN ('high', 'urgent') AND COALESCE(c.last_message_at, c.updated_at) <= ?)
           OR (COALESCE(c.last_message_at, c.updated_at) <= ?)
           OR (c.due_at IS NOT NULL AND c.due_at <= ?)
         )
         AND (c.snoozed_until IS NULL OR c.snoozed_until <= ?)
       ORDER BY COALESCE(c.due_at, c.last_message_at) ASC
       LIMIT 20`,
      [row.user_id, urgentCutoff, cutoff, now, now]
    );

    // Also include assigned-to-you needs_reply regardless of age (bypass)
    const [assigned] = await pool.execute(
      `SELECT c.id, c.subject, c.status, c.priority, c.last_message_at, c.due_at, c.agency_id
       FROM communication_conversations c
       WHERE c.archived_at IS NULL
         AND c.owner_user_id = ?
         AND c.status IN ('new', 'needs_reply', 'follow_up')
         AND (c.snoozed_until IS NULL OR c.snoozed_until <= ?)
       ORDER BY c.last_message_at DESC
       LIMIT 10`,
      [row.user_id, now]
    );

    const byId = new Map();
    for (const c of [...(assigned || []), ...(convs || [])]) byId.set(c.id, c);
    const items = [...byId.values()];
    if (!items.length) continue;

    const agencyId = row.agency_id || items[0]?.agency_id || null;
    const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(/\/$/, '');
    const inboxUrl = `${baseUrl}/admin/communications?mode=home`;

    const lines = items.slice(0, 12).map((c) => {
      const subj = String(c.subject || '(no subject)').slice(0, 80);
      return `• [${c.status}] ${subj}`;
    });

    const html = `
      <p>Hi ${row.first_name || 'there'},</p>
      <p>You have <strong>${items.length}</strong> conversation(s) in the Communications Inbox that still need attention
      (waiting longer than ${hours} hours, or assigned to you).</p>
      <p>${lines.join('<br/>')}</p>
      <p><a href="${inboxUrl}">Open Communications Center</a></p>
      <p style="color:#64748b;font-size:12px">Replies are made in the app (not by replying to this email).
      You opted in to personal-email notifications for inbox follow-ups.</p>
    `;

    try {
      await sendNotificationEmail({
        to,
        subject: `Inbox digest: ${items.length} conversation(s) need attention`,
        html,
        text: `You have ${items.length} conversation(s) needing attention.\n${lines.join('\n')}\n\nOpen: ${inboxUrl}`,
        agencyId,
        userId: row.user_id,
        templateType: 'inbox_digest',
        source: 'auto'
      });
      await pool.execute(
        `UPDATE user_communication_prefs SET last_inbox_digest_at = ? WHERE user_id = ?`,
        [now, row.user_id]
      );
      sent += 1;
    } catch (e) {
      console.warn('[inboxDigest] send failed for user', row.user_id, e?.message || e);
    }
  }

  return { sent, checked: (prefsRows || []).length };
}
