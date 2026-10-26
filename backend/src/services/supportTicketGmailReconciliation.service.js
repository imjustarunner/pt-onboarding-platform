import { emailHash, emailKey } from './supportTicketEmailPolicy.js';
import { ingestSupportTicketEmail } from './supportTicketEmailInbound.service.js';
import { resolveSupportTicketEmailThread } from './supportTicketEmail.service.js';

const addresses = (value) => [...new Set((String(value || '').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(emailKey))];
function plainBody(payload) {
  const parts = [payload];
  let html = '';
  while (parts.length) {
    const part = parts.shift();
    if (!part) continue;
    if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
    if (part.mimeType === 'text/html' && part.body?.data) html ||= Buffer.from(part.body.data, 'base64url').toString('utf8');
    parts.push(...(part.parts || []));
  }
  return html.replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

export function parseSupportGmailMessage(message, { ownAddresses = [], staff = [] } = {}) {
  const h = new Map((message.payload?.headers || []).map((header) => [String(header.name).toLowerCase(), String(header.value || '')]));
  const own = new Set(ownAddresses.map(emailKey));
  let from = addresses(h.get('from'))[0] || '';
  const original = addresses(h.get('x-original-sender'))[0] || addresses(h.get('x-google-original-from'))[0];
  if (own.has(from)) {
    if (original) from = original;
    else if (h.has('list-id') || /\bvia\b/i.test(h.get('from') || '')) {
      from = [...addresses(h.get('reply-to')), ...addresses(h.get('sender'))].find((e) => !own.has(e)) || from;
    }
  }
  const sender = staff.find((s) => [s.email, s.work_email, s.personal_email, s.username].map(emailKey).includes(from));
  return { fromEmail: from, fromDisplayName: String(h.get('from') || '').replace(/<[^>]*>/g, '').replace(/^"|"$/g, '').trim(),
    messageId: h.get('message-id') || `gmail:${message.id}`, gmailMessageId: message.id,
    threadId: message.threadId, subject: h.get('subject') || '', bodyText: plainBody(message.payload),
    inReplyTo: h.get('in-reply-to') || null, referencesHeader: h.get('references') || null,
    recipients: addresses(h.get('to')), cc: addresses(h.get('cc')), payload: message.payload,
    receivedAt: new Date(Number(message.internalDate) || Date.now()), staffCopy: !!sender || own.has(from),
    staffUserId: sender?.id || null,
    automated: (h.get('auto-submitted') && h.get('auto-submitted').toLowerCase() !== 'no') || /^(mailer-daemon|postmaster)@/i.test(from) };
}

/** No provider sends, no status changes, no ownership changes, no generation.
 * Default operation is a metadata-only dry run. */
export async function reconcileSupportTicketThreadFromGmail({ agencyId, ticketId, threadId, gmail,
  ownAddresses = [], staff = [], since = null, apply = false, outboundOnly = false }, dependencies = {}) {
  const ingest = dependencies.ingest || ingestSupportTicketEmail;
  const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  const messages = [...(thread.data?.messages || [])].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const result = { ticketId, threadId, received: 0, staffReplies: 0, skipped: 0, captured: 0, duplicates: 0, apply };
  let previousInbound = null;
  for (const message of messages) {
    const parsed = parseSupportGmailMessage(message, { ownAddresses, staff });
    if (!parsed.fromEmail || parsed.automated) { result.skipped += 1; continue; }
    if (!parsed.staffCopy) previousInbound = parsed;
    if ((since && parsed.receivedAt < since) || (outboundOnly && !parsed.staffCopy)) { result.skipped += 1; continue; }
    if (outboundOnly) {
      // Do not race the live inbox: an unseen incoming email must be ingested by
      // that worker first so it can reopen the ticket and invalidate the draft.
      if (!previousInbound) { result.skipped += 1; continue; }
      const sourceKnown = dependencies.sourceKnown || (async (source) => {
        const database = (await import('../config/database.js')).default;
        const [[known]] = await database.execute(`SELECT t.id FROM support_tickets t WHERE t.agency_id=? AND t.id=?
          AND (t.source_email_message_id=? OR EXISTS (SELECT 1 FROM support_ticket_email_messages e
            WHERE e.ticket_id=t.id AND e.direction='inbound' AND e.internet_message_id_hash=?)) LIMIT 1`,
        [agencyId, ticketId, source.messageId, emailHash(source.messageId)]);
        return !!known;
      });
      if (!await sourceKnown(previousInbound)) { result.skipped += 1; continue; }
    }
    if (parsed.staffCopy) result.staffReplies += 1; else result.received += 1;
    if (!apply) continue;
    const saved = await ingest({ ...parsed, agencyId, targetTicketId: ticketId, gmail,
      createIfMissing: false, generateDraft: false, preserveTicketState: true });
    if (saved.handled) result.captured += 1;
    if (saved.duplicate) result.duplicates += 1;
    if (!saved.handled) result.skipped += 1;
  }
  return result;
}

/** Poll known support threads for staff Gmail copies that weren't addressed to
 * the intake alias. It never creates/acknowledges incoming mail or sends mail. */
export async function runSupportTicketGmailReconciliation({ limit = 20 } = {}, dependencies = {}) {
  const database = dependencies.database || (await import('../config/database.js')).default;
  const gmail = dependencies.gmail || await (await import('./unifiedEmail/supportGmailReadClient.js')).getSupportGmailReadClient();
  const [configs] = await database.execute('SELECT agency_id FROM support_reply_pilot_config WHERE is_enabled=1');
  const outcomes = [];
  for (const config of configs) {
    const agencyId = Number(config.agency_id);
    const [tickets] = await database.execute(`SELECT t.id,t.school_organization_id,t.client_id,t.topic,t.source_email_thread_id,t.claimed_by_user_id,s.last_checked_at
      FROM support_tickets t LEFT JOIN support_ticket_email_thread_sync s ON s.agency_id=t.agency_id
        AND BINARY s.gmail_thread_id=BINARY t.source_email_thread_id
      WHERE t.agency_id=? AND t.source_channel='email' AND t.source_email_thread_id IS NOT NULL
        AND (t.updated_at>=NOW()-INTERVAL 3 DAY OR t.status IN ('open','answered'))
        AND (s.last_checked_at IS NULL OR s.last_checked_at<NOW()-INTERVAL 5 MINUTE)
      ORDER BY COALESCE(s.last_checked_at,'1970-01-01') ASC,(t.claimed_by_user_id IS NOT NULL) DESC,t.id DESC LIMIT 500`, [agencyId]);
    if (!tickets.length) continue;
    const [identities] = await database.execute('SELECT from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1', [agencyId]);
    const [schools] = await database.execute(`SELECT DISTINCT sp.itsco_email FROM school_profiles sp JOIN organization_affiliations oa
      ON oa.organization_id=sp.school_organization_id WHERE oa.agency_id=? AND oa.is_active=1`, [agencyId]);
    const [staff] = await database.execute(`SELECT DISTINCT u.id,u.email,u.work_email,u.personal_email,u.username FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      WHERE u.role NOT IN ('school_staff','client_guardian') AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0`, [agencyId]);
    const ownAddresses = [...identities.map((i) => i.from_email), ...schools.map((s) => s.itsco_email)].filter(Boolean);
    const groups = new Map();
    for (const ticket of tickets) {
      if (!groups.has(ticket.source_email_thread_id)) groups.set(ticket.source_email_thread_id, []);
      groups.get(ticket.source_email_thread_id).push(ticket);
    }
    for (const [threadId, rows] of [...groups].slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))) {
      let errorCode = null;
      try {
        const scopes = new Set(rows.map((t) => JSON.stringify([t.school_organization_id, t.client_id, t.topic])));
        if (scopes.size !== 1) { errorCode = 'ambiguous_ticket_scope'; continue; }
        const canonical = await resolveSupportTicketEmailThread({ ...rows[0], agency_id: agencyId, source_channel: 'email' }, database);
        outcomes.push(await reconcileSupportTicketThreadFromGmail({ agencyId, ticketId: canonical.canonicalTicketId,
          threadId, gmail, ownAddresses, staff, apply: true, outboundOnly: true }, dependencies));
      } catch (error) { errorCode = String(error.code || 'gmail_history_pending').slice(0, 100); }
      finally {
        await database.execute(`INSERT INTO support_ticket_email_thread_sync (agency_id,gmail_thread_id,last_checked_at,last_error_code)
          VALUES (?,?,NOW(),?) ON DUPLICATE KEY UPDATE last_checked_at=NOW(),last_error_code=VALUES(last_error_code)`, [agencyId, threadId, errorCode]);
      }
    }
  }
  return outcomes;
}
