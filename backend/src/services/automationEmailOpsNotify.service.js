/**
 * When an automated email is pending, failed, skipped, or quality-blocked,
 * send a short ops notice to testing@itsco.health so ITSCO can track holds.
 *
 * Skips: ops alerts themselves, successful demo redirects, and already-notified rows.
 */
import pool from '../config/database.js';
import GoogleWorkspaceEmailService from './googleWorkspaceEmail.service.js';
import { HOGWARTS_TEST_INBOX } from '../utils/hogwartsTestEmail.js';

export const AUTOMATION_OPS_ALERT_TEMPLATE = 'automation_ops_alert';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeStatus(status) {
  const s = String(status || 'held').trim().toLowerCase();
  if (['pending', 'failed', 'skipped', 'flagged', 'blocked', 'bounced', 'undelivered'].includes(s)) {
    return s;
  }
  return s || 'held';
}

async function markOpsNotified(communicationId) {
  const id = Number(communicationId || 0);
  if (!id) return;
  try {
    const [rows] = await pool.execute(
      'SELECT metadata FROM user_communications WHERE id = ? LIMIT 1',
      [id]
    );
    let meta = {};
    const raw = rows?.[0]?.metadata;
    if (raw) {
      try {
        meta = typeof raw === 'string' ? JSON.parse(raw) : { ...raw };
      } catch {
        meta = {};
      }
    }
    if (meta.opsNotifiedAt) return false;
    meta.opsNotifiedAt = new Date().toISOString();
    meta.opsNotifiedTo = HOGWARTS_TEST_INBOX;
    await pool.execute(
      'UPDATE user_communications SET metadata = ? WHERE id = ?',
      [JSON.stringify(meta), id]
    );
    return true;
  } catch {
    return true;
  }
}

async function alreadyNotified(communicationId) {
  const id = Number(communicationId || 0);
  if (!id) return false;
  try {
    const [rows] = await pool.execute(
      'SELECT metadata FROM user_communications WHERE id = ? LIMIT 1',
      [id]
    );
    const raw = rows?.[0]?.metadata;
    if (!raw) return false;
    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!(meta?.opsNotifiedAt);
  } catch {
    return false;
  }
}

/**
 * @param {object} params
 * @param {number|null} [params.communicationId]
 * @param {string|null} [params.to]
 * @param {string|null} [params.subject]
 * @param {string} [params.deliveryStatus] - pending | failed | skipped | flagged | blocked
 * @param {string|null} [params.errorMessage]
 * @param {string|null} [params.reason]
 * @param {string|null} [params.templateType]
 * @param {number|null} [params.agencyId]
 * @param {Array} [params.qualityFlags]
 * @param {object|null} [params.metadata]
 * @param {string|null} [params.bodyPreview]
 */
export async function notifyTestingInboxOfHeldEmail({
  communicationId = null,
  to = null,
  subject = null,
  deliveryStatus = 'held',
  errorMessage = null,
  reason = null,
  templateType = null,
  agencyId = null,
  qualityFlags = null,
  metadata = null,
  bodyPreview = null
} = {}) {
  try {
    const tpl = String(templateType || '').trim().toLowerCase();
    if (tpl === AUTOMATION_OPS_ALERT_TEMPLATE) return { skipped: true, reason: 'ops_alert' };
    if (metadata?.opsAlert === true) return { skipped: true, reason: 'ops_alert' };
    // Successful demo redirects are intentional sends — not holds.
    if (metadata?.testInboxRedirect && ['sent', 'delivered'].includes(String(deliveryStatus || '').toLowerCase())) {
      return { skipped: true, reason: 'demo_redirect_sent' };
    }

    const status = normalizeStatus(deliveryStatus);
    if (communicationId && (await alreadyNotified(communicationId))) {
      return { skipped: true, reason: 'already_notified' };
    }

    if (!GoogleWorkspaceEmailService.isConfigured()) {
      return { skipped: true, reason: 'email_not_configured' };
    }

    const flagsText = Array.isArray(qualityFlags) && qualityFlags.length
      ? qualityFlags.map((f) => f.message || f.code).filter(Boolean).join('; ')
      : '';
    const why = errorMessage || reason || flagsText || status;
    const origTo = String(to || metadata?.originalTo || '').trim() || '(unknown recipient)';
    const origSubject = String(subject || '').trim() || '(no subject)';
    const opsSubject = `[Automation ${status}] ${origSubject} → ${origTo}`.slice(0, 200);

    const lines = [
      `An automated email was ${status} and may need attention.`,
      '',
      `Status: ${status}`,
      `Original To: ${origTo}`,
      `Subject: ${origSubject}`,
      `Template: ${templateType || '(none)'}`,
      `Agency ID: ${agencyId || '(none)'}`,
      `Communication ID: ${communicationId || '(none)'}`,
      `Reason: ${why}`,
      ''
    ];
    if (flagsText) {
      lines.push(`Quality flags: ${flagsText}`, '');
    }
    if (bodyPreview) {
      lines.push('Body preview:', String(bodyPreview).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800));
    }

    const text = lines.join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <p><strong>An automated email was ${escapeHtml(status)} and may need attention.</strong></p>
        <ul>
          <li><strong>Status:</strong> ${escapeHtml(status)}</li>
          <li><strong>Original To:</strong> ${escapeHtml(origTo)}</li>
          <li><strong>Subject:</strong> ${escapeHtml(origSubject)}</li>
          <li><strong>Template:</strong> ${escapeHtml(templateType || '(none)')}</li>
          <li><strong>Agency ID:</strong> ${escapeHtml(agencyId || '(none)')}</li>
          <li><strong>Communication ID:</strong> ${escapeHtml(communicationId || '(none)')}</li>
          <li><strong>Reason:</strong> ${escapeHtml(why)}</li>
          ${flagsText ? `<li><strong>Quality flags:</strong> ${escapeHtml(flagsText)}</li>` : ''}
        </ul>
      </div>
    `.trim();

    // Claim notify slot before send so concurrent callers don't double-send.
    if (communicationId) {
      const claimed = await markOpsNotified(communicationId);
      if (claimed === false) return { skipped: true, reason: 'already_notified' };
    }

    await GoogleWorkspaceEmailService.sendEmail({
      to: HOGWARTS_TEST_INBOX,
      subject: opsSubject,
      text,
      html,
      fromName: 'PlotTwist Automation',
      // Pass through so rewrite does not treat this as a demo-agency fan-out.
      agencyId: null
    });

    return { sent: true, to: HOGWARTS_TEST_INBOX };
  } catch (e) {
    console.warn('[automationOpsNotify] failed to notify testing inbox', e?.message || e);
    return { skipped: true, reason: 'send_failed', error: String(e?.message || e) };
  }
}

export default { notifyTestingInboxOfHeldEmail, AUTOMATION_OPS_ALERT_TEMPLATE };
