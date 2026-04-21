/**
 * Debug outbound email delivery vs. Communications rows.
 *
 * Why this exists:
 * - The app logs emails to `user_communications` even when a send is skipped/blocked
 *   (by design, per DIGITAL_FORMS_INTAKE_CONTRACT.md).
 * - Multi-child completion emails also create sibling "mirror" rows so every child
 *   has a Communications breadcrumb, but only ONE actual outbound email is sent.
 *
 * This script helps distinguish:
 * - sent (external_message_id present) vs. mirrored (no external_message_id)
 * - skipped/failed (delivery_status + error_message)
 * - what Gmail thinks the message headers were (To/From/Subject/Date)
 *
 * Usage:
 *   node --input-type=module backend/src/scripts/debugEmailDelivery.js --commId 123
 *   node --input-type=module backend/src/scripts/debugEmailDelivery.js --to someone@domain.com
 */
import pool from '../config/database.js';
import { getGmailClient, getImpersonatedUser } from '../services/unifiedEmail/gmailClient.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const k = String(argv[i] || '');
    const v = argv[i + 1];
    if (k === '--commId') args.commId = Number.parseInt(String(v || ''), 10);
    if (k === '--to') args.to = String(v || '').trim();
  }
  return args;
}

function maskEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at <= 1) return e ? '***' : '';
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

async function loadCommunicationById(id) {
  const [rows] = await pool.execute(
    `SELECT id, template_type, delivery_status, error_message, recipient_address,
            subject, external_message_id, sent_at, generated_at, metadata
       FROM user_communications
      WHERE id = ?
      LIMIT 1`,
    [Number(id)]
  );
  return rows?.[0] || null;
}

async function listRecentCommunicationsByRecipient(to) {
  const [rows] = await pool.execute(
    `SELECT id, template_type, delivery_status, LEFT(COALESCE(error_message,''),160) AS error_preview,
            recipient_address, subject, external_message_id, sent_at, generated_at
       FROM user_communications
      WHERE channel = 'email'
        AND LOWER(recipient_address) = LOWER(?)
      ORDER BY id DESC
      LIMIT 15`,
    [String(to)]
  );
  return rows || [];
}

function pickHeader(headers, name) {
  const n = String(name || '').toLowerCase();
  const h = Array.isArray(headers) ? headers : [];
  const row = h.find((x) => String(x?.name || '').toLowerCase() === n) || null;
  return row?.value || null;
}

async function fetchGmailHeadersByMessageId(messageId) {
  const gmail = await getGmailClient();
  const result = await gmail.users.messages.get({
    userId: 'me',
    id: String(messageId),
    format: 'metadata',
    metadataHeaders: ['To', 'From', 'Subject', 'Date', 'Message-Id']
  });
  const headers = result?.data?.payload?.headers || [];
  return {
    id: result?.data?.id || null,
    threadId: result?.data?.threadId || null,
    labelIds: result?.data?.labelIds || [],
    internalDateMs: result?.data?.internalDate ? Number(result.data.internalDate) : null,
    to: pickHeader(headers, 'To'),
    from: pickHeader(headers, 'From'),
    subject: pickHeader(headers, 'Subject'),
    date: pickHeader(headers, 'Date'),
    messageIdHeader: pickHeader(headers, 'Message-Id')
  };
}

async function main() {
  const { commId, to } = parseArgs(process.argv);
  if (!commId && !to) {
    console.log('Provide --commId <id> or --to <recipientEmail>');
    process.exit(2);
  }

  if (to && !commId) {
    const rows = await listRecentCommunicationsByRecipient(to);
    console.log(`Recent email communications for ${maskEmail(to)} (most recent first):`);
    for (const r of rows) {
      console.log(
        `- id=${r.id} status=${r.delivery_status} ext=${r.external_message_id || '(none)'} sent_at=${r.sent_at || '(null)'} template=${r.template_type} subject=${JSON.stringify(r.subject || '')}`
      );
      if (r.error_preview) console.log(`    error: ${String(r.error_preview)}`);
    }
    await pool.end();
    return;
  }

  const comm = await loadCommunicationById(commId);
  if (!comm) {
    console.log(`No user_communications row found for id=${commId}`);
    await pool.end();
    process.exit(1);
  }

  console.log('Communication row:');
  console.log({
    id: comm.id,
    template_type: comm.template_type,
    delivery_status: comm.delivery_status,
    recipient_address: maskEmail(comm.recipient_address),
    subject: comm.subject,
    external_message_id: comm.external_message_id || null,
    sent_at: comm.sent_at || null,
    generated_at: comm.generated_at || null
  });
  if (comm.error_message) console.log('error_message:', String(comm.error_message).slice(0, 500));

  const meta = (() => { try { return comm.metadata ? JSON.parse(comm.metadata) : null; } catch { return comm.metadata || null; } })();
  if (meta) console.log('metadata:', meta);

  if (!comm.external_message_id) {
    console.log('\nNo external_message_id on this row.');
    console.log(
      'This usually means either (a) the send was skipped/failed before Gmail returned an id, or (b) this is a sibling “mirror” row (no second outbound email).'
    );
    await pool.end();
    return;
  }

  console.log('\nGmail lookup (impersonated user):', getImpersonatedUser());
  try {
    const gmailMeta = await fetchGmailHeadersByMessageId(comm.external_message_id);
    console.log('Gmail message metadata:', gmailMeta);
  } catch (e) {
    console.log('Failed to fetch Gmail message metadata:', e?.message || String(e));
  } finally {
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});

