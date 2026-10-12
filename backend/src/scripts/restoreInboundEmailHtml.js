/** Repair existing text-only inbox copies from their exact relay message.
 * Dry run by default. --apply writes HTML only; never imports mail or resends it.
 * Usage: node src/scripts/restoreInboundEmailHtml.js [--apply] [--limit=100] [--user-id=501]
 */
import 'dotenv/config';
import pool from '../config/database.js';
import { getGmailClient } from '../services/unifiedEmail/gmailClient.js';
import { headerMap, readGmailBodyHtml } from '../utils/gmailMessageParse.shared.js';
import { restoreMissingInboundHtml } from '../services/inboundEmailPersistence.service.js';

const apply = process.argv.includes('--apply');
const option = key => process.argv.find(arg => arg.startsWith(`--${key}=`))?.split('=')[1];
const limit = Number(option('limit') || 100);
const userId = option('user-id') ? Number(option('user-id')) : null;
if (!Number.isInteger(limit) || limit < 1 || limit > 500 || (userId !== null && (!Number.isInteger(userId) || userId < 1))) throw new Error('Invalid limit or user-id');
try {
  const [rows] = await pool.execute(`SELECT m.id, m.internet_message_id FROM communication_messages m
    JOIN communication_conversations c ON c.id=m.conversation_id
    JOIN communication_inboxes i ON i.id=c.inbox_id
    WHERE m.channel='email' AND m.direction='inbound' AND (m.body_html IS NULL OR m.body_html='')
      AND m.internet_message_id IS NOT NULL ${userId ? 'AND i.owner_user_id=?' : ''}
    ORDER BY m.id DESC LIMIT ${limit}`, userId ? [userId] : []);
  const gmail = await getGmailClient();
  const counts = { scanned: rows.length, recoverable: 0, restored: 0, unavailable: 0, failed: 0 };
  for (const row of rows) {
    try {
      const delivery = row.internet_message_id;
      let id;
      if (/^(?:gmail:|event-email:)[a-f0-9]+$/i.test(delivery)) id = delivery.split(':')[1];
      else if (/^<[^<>\s]+>$/.test(delivery)) {
        const { data } = await gmail.users.messages.list({ userId: 'me', q: `rfc822msgid:${delivery.slice(1, -1)}`, maxResults: 2 });
        if (data.messages?.length === 1) id = data.messages[0].id;
      }
      if (!id) { counts.unavailable++; continue; }
      const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      if (delivery.startsWith('<') && headerMap(data.payload?.headers).get('message-id') !== delivery) { counts.unavailable++; continue; }
      const html = await readGmailBodyHtml(data.payload, { gmail, gmailMessageId: id });
      if (!html) { counts.unavailable++; continue; }
      counts.recoverable++;
      if (apply && await restoreMissingInboundHtml(pool, row.id, html)) counts.restored++;
    } catch (error) {
      counts.failed++;
      console.warn('HTML recovery failed', row.id, error.code || 'lookup_failed');
      if (error.code === 'GMAIL_MAILBOX_THROTTLED') break;
    }
  }
  console.log(JSON.stringify({ apply, ...counts }));
  if (counts.failed) process.exitCode = 1;
} finally { await pool.end(); }
