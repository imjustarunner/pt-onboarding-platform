/**
 * prehireNotification.service.js
 *
 * Batched pre-hire notification system.
 *
 * When anything is added to a pre-hire candidate's account (documents,
 * training, etc.) we record it in `prehire_notification_queue`.  If an entry
 * already exists for that user we simply append the item — keeping the original
 * `fire_at` so the 15-minute window is counted from the FIRST addition, not
 * each subsequent one.
 *
 * A polling loop in server.js calls processOverduePrehireNotifications() every
 * minute.  It finds rows whose fire_at has passed, sends one batched email
 * with a fresh portal link, then marks the row 'sent'.
 */

import pool from '../config/database.js';
import config from '../config/config.js';
import User from '../models/User.model.js';

const DELAY_MINUTES = 15;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Queue (or append to an existing pending entry) a batched notification for
 * a pre-hire candidate.
 *
 * @param {number} userId   - candidate user_id
 * @param {number} agencyId
 * @param {{ type: string, title: string }} item - describes what was added
 */
export async function queuePrehireNotification(userId, agencyId, item) {
  const uid = parseInt(userId, 10);
  const aid = parseInt(agencyId, 10);
  if (!uid || !aid) return;

  try {
    const [existing] = await pool.execute(
      `SELECT id, items_json FROM prehire_notification_queue
       WHERE user_id = ? AND status = 'pending'
       ORDER BY id DESC LIMIT 1`,
      [uid]
    );

    if (existing.length > 0) {
      // Append item to the existing window — do NOT reset fire_at
      const row = existing[0];
      const items = safeParseJson(row.items_json, []);
      if (item) items.push(item);
      await pool.execute(
        `UPDATE prehire_notification_queue SET items_json = ? WHERE id = ?`,
        [JSON.stringify(items), row.id]
      );
    } else {
      // Start a new 15-minute window
      const fireAt = new Date(Date.now() + DELAY_MINUTES * 60 * 1000);
      const items = item ? [item] : [];
      await pool.execute(
        `INSERT INTO prehire_notification_queue (user_id, agency_id, fire_at, items_json)
         VALUES (?, ?, ?, ?)`,
        [uid, aid, fireAt, JSON.stringify(items)]
      );
    }
  } catch (err) {
    // Non-fatal — never block the main request
    console.warn('[prehireNotification] queuePrehireNotification error:', err?.message);
  }
}

/**
 * Find all overdue pending notifications and send one batched email per row.
 * Called on a polling interval from server.js.
 */
export async function processOverduePrehireNotifications() {
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT q.*,
              u.personal_email, u.email, u.first_name, u.last_name,
              a.name AS agency_name
       FROM prehire_notification_queue q
       JOIN users u  ON u.id  = q.user_id
       JOIN agencies a ON a.id = q.agency_id
       WHERE q.status = 'pending'
         AND q.fire_at <= NOW()
       LIMIT 20`,
      []
    );
  } catch (err) {
    console.warn('[prehireNotification] processOverdue query error:', err?.message);
    return;
  }

  for (const row of rows || []) {
    try {
      await sendBatchedEmail(row);
      await pool.execute(
        `UPDATE prehire_notification_queue SET status = 'sent' WHERE id = ?`,
        [row.id]
      );
    } catch (err) {
      console.error('[prehireNotification] send failed for user', row.user_id, ':', err?.message);
      await pool.execute(
        `UPDATE prehire_notification_queue SET status = 'failed' WHERE id = ?`,
        [row.id]
      ).catch(() => {});
    }
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function sendBatchedEmail(row) {
  const recipientEmail = row.personal_email || row.email;
  if (!recipientEmail) return;

  // Regenerate a fresh 7-day portal token so the link in the email is always valid
  const tokenResult = await User.generatePasswordlessToken(row.user_id, 7 * 24).catch(() => null);
  const portalLink = tokenResult
    ? `${config.frontendUrl}/pre-hire/${tokenResult.token}`
    : null;

  const firstName  = row.first_name  || 'there';
  const agencyName = row.agency_name || 'People Operations';
  const items      = safeParseJson(row.items_json, []);

  const subject = `New tasks added to your pre-hire account — ${agencyName}`;

  // ── Plain text ─────────────────────────────────────────────────────────────
  const itemLines = items.length
    ? items.map((it) => `• ${it.title || it.type || 'New item'}`).join('\n')
    : '• New tasks have been added to your account.';

  const text = [
    `Hi ${firstName},`,
    '',
    'The following has been added to your pre-hire account:',
    '',
    itemLines,
    '',
    portalLink
      ? `Log in to view and complete these items:\n${portalLink}`
      : 'Log in to your pre-hire portal to view your tasks.',
    '',
    'This link is valid for 7 days.',
    '',
    `— ${agencyName}`,
  ].join('\n');

  // ── HTML ───────────────────────────────────────────────────────────────────
  const itemsHtml = items.length
    ? items.map((it) => `<li style="margin-bottom:6px">${esc(it.title || it.type || 'New item')}</li>`).join('')
    : '<li>New tasks have been added to your account.</li>';

  const ctaHtml = portalLink
    ? `<p style="text-align:center;margin:28px 0">
         <a href="${esc(portalLink)}"
            style="background:#16a34a;color:#fff;padding:14px 28px;border-radius:8px;
                   text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
           Access Your Pre-Hire Portal →
         </a>
       </p>
       <p style="font-size:11px;color:#9ca3af;text-align:center;word-break:break-all">${esc(portalLink)}</p>
       <p style="font-size:11px;color:#9ca3af;text-align:center">This link is valid for 7 days.</p>`
    : '';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
  <p style="font-size:15px">Hi ${esc(firstName)},</p>
  <p style="font-size:15px">The following has been added to your pre-hire account at <strong>${esc(agencyName)}</strong>:</p>
  <ul style="font-size:14px;line-height:1.8;padding-left:20px">
    ${itemsHtml}
  </ul>
  <p style="font-size:14px">Log in to view and complete these items:</p>
  ${ctaHtml}
  <p style="font-size:14px;margin-top:32px">— ${esc(agencyName)}</p>
</div>`.trim();

  // ── Send ───────────────────────────────────────────────────────────────────
  const emailOpts = {
    to: recipientEmail,
    subject,
    text,
    html,
    userId: row.user_id,
    agencyId: row.agency_id,
    templateType: 'prehire_new_tasks',
    source: 'auto',
  };

  // Prefer agency sender identity (matches branding of other pre-hire emails)
  try {
    const { resolveJobApplicationSenderIdentity } = await import('./hiringReferenceIdentity.service.js');
    const { sendEmailFromIdentity }               = await import('./unifiedEmail/unifiedEmailSender.service.js');
    const identity = await resolveJobApplicationSenderIdentity(row.agency_id);
    if (identity?.id) {
      await sendEmailFromIdentity({ senderIdentityId: identity.id, ...emailOpts });
      return;
    }
  } catch { /* fall through to platform email */ }

  const { default: EmailService } = await import('./email.service.js');
  await EmailService.sendEmail(emailOpts);
}

function safeParseJson(raw, fallback) {
  try { return JSON.parse(raw || 'null') ?? fallback; } catch { return fallback; }
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
