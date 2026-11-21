import { createHash } from 'node:crypto';

export const CODEX_ASSISTANT_MAIL_TYPE = 'codex_assistant_requested_email';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const mailbox = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const fields = new Set(['requestId', 'agencyId', 'from', 'replyTo', 'to', 'cc', 'bcc', 'subject', 'text', 'portalButton']);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const accountSetupLink = /https:\/\/[^\s/]+\/[^\s]*\/(?:new_account|reset-password)\//i;
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function address(value) {
  const result = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (result.length > 254 || !mailbox.test(result)) {
    throw fail(400, 'INVALID_MAIL_ADDRESS', 'Enter one valid email address per field.');
  }
  return result;
}

export function parseCodexAssistantMail(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.has(key)) ||
      typeof input.requestId !== 'string' || !uuid.test(input.requestId) || !Number.isSafeInteger(input.agencyId) || input.agencyId < 1) {
    throw fail(400, 'INVALID_MAIL_REQUEST', 'Provide a unique request ID, owning agency and message.');
  }
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!subject || subject.length > 200 || /[\u0000-\u001f\u007f]/.test(subject) ||
      !text || text.length > 10000 || /\u0000/.test(text) ||
      (input.portalButton !== undefined && typeof input.portalButton !== 'boolean')) {
    throw fail(400, 'INVALID_MAIL_CONTENT', 'Provide a subject and plain-text message within the length limits.');
  }
  if (accountSetupLink.test(text)) {
    throw fail(400, 'MAIL_CREDENTIAL_LINK', 'Use the portal invitation workflow to send an account setup or password reset link.');
  }
  const to = address(input.to);
  const rawCc = input.cc ?? [];
  if (!Array.isArray(rawCc) || rawCc.length > 3) {
    throw fail(400, 'INVALID_MAIL_CC', 'Add at most three individual CC addresses.');
  }
  const cc = [...new Set(rawCc.map(address))].filter(value => value !== to).sort();
  const rawBcc = input.bcc ?? [];
  if (!Array.isArray(rawBcc) || rawBcc.length > 20) {
    throw fail(400, 'INVALID_MAIL_BCC', 'Add at most twenty individual BCC addresses.');
  }
  const bcc = [...new Set(rawBcc.map(address))].filter(value => value !== to && !cc.includes(value)).sort();
  return {
    requestId: input.requestId.toLowerCase(), agencyId: input.agencyId, from: address(input.from),
    replyTo: input.replyTo == null ? null : address(input.replyTo), to, cc, subject, text,
    portalButton: input.portalButton === true,
    ...(bcc.length ? { bcc } : {})
  };
}

function grantedAliases(configuration, agencyId, slug) {
  let parsed;
  try { parsed = JSON.parse(configuration || '{}'); } catch { parsed = null; }
  const selected = parsed && Object.hasOwn(parsed, String(agencyId)) ? parsed[agencyId]
    : parsed && slug && Object.hasOwn(parsed, slug) ? parsed[slug] : null;
  return new Set(Array.isArray(selected) ? selected.map(email => String(email).trim().toLowerCase()) : []);
}

async function activeSharedAlias(db, agencyId, email) {
  const [rows] = await db.execute(`SELECT e.id,a.portal_url,a.slug,
      (LOWER(e.identity_key)=SUBSTRING_INDEX(LOWER(e.from_email),'@',1)) AS canonical
    FROM email_sender_identities e JOIN agencies a ON a.id=e.agency_id
    WHERE e.agency_id=? AND LOWER(e.from_email)=? AND e.is_active=1
      AND a.organization_type='agency' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      AND EXISTS (SELECT 1 FROM communication_inboxes i WHERE i.sender_identity_id=e.id
        AND i.agency_id=e.agency_id AND i.kind='shared' AND i.is_active=1
        AND i.owner_user_id IS NULL AND LOWER(i.from_email)=LOWER(e.from_email))
    ORDER BY canonical DESC LIMIT 2`, [agencyId, email]);
  // The same address can support several workflows. Only an exact department
  // identity can disambiguate a shared address, such as Technology and recovery.
  if (!rows.length || (rows.length > 1 && (!Number(rows[0].canonical) || Number(rows[1].canonical)))) {
    throw fail(409, 'MAIL_ALIAS_UNAVAILABLE', 'The selected shared mailbox is unavailable in this agency.');
  }
  return rows[0];
}

function receipt(row, reused = false) {
  return { requestId: row.request_id, status: row.status, communicationId: row.communication_id ?? null, reused };
}

export async function sendCodexAssistantMail({ input, principal, configuration, db, send, log, preflight = false }) {
  const message = parseCodexAssistantMail(input);
  const { requestId, agencyId, from, replyTo, to, cc, bcc = [], subject } = message;
  const sender = await activeSharedAlias(db, agencyId, from);
  const grants = grantedAliases(configuration, agencyId, sender.slug);
  if (!grants.has(from) || (replyTo && !grants.has(replyTo))) {
    throw fail(403, 'MAIL_ALIAS_NOT_GRANTED', 'Codex Assistant has no grant for this agency and alias.');
  }
  if (replyTo && replyTo !== from) await activeSharedAlias(db, agencyId, replyTo);
  const slug = String(sender.portal_url || sender.slug || '').trim();
  if (message.portalButton && !/^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)) {
    throw fail(409, 'PORTAL_SIGN_IN_UNAVAILABLE', 'The agency does not have a valid portal address.');
  }
  const portalUrl = message.portalButton ? `https://auricwell.com/${encodeURIComponent(slug)}/login` : null;
  if (preflight) return { requestId, status: 'ready', agencyId, from, replyTo: replyTo || from };
  const digest = createHash('sha256').update(JSON.stringify({ ...message, portalUrl, senderId: sender.id, principal })).digest('hex');
  let claimed;
  try {
    await db.execute(`INSERT INTO codex_assistant_mail_deliveries
      (request_id,agency_id,sender_identity_id,automation_subject,payload_hash,status)
      VALUES (?,?,?,?,?,'sending')`, [requestId, agencyId, sender.id, principal, digest]);
    claimed = true;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
  }
  if (!claimed) {
    const [[row]] = await db.execute(`SELECT request_id,payload_hash,status,communication_id
      FROM codex_assistant_mail_deliveries WHERE request_id=? AND agency_id=? AND automation_subject=?`, [requestId, agencyId, principal]);
    if (row?.payload_hash !== digest) throw fail(409, 'MAIL_REQUEST_CHANGED', 'This request ID is bound to a different message.');
    return receipt(row, true);
  }

  let communicationId = null;
  let status = 'held';
  try {
    const text = portalUrl ? `${message.text}\n\nSign in to AuricWell: ${portalUrl}` : message.text;
    const html = portalUrl ? `<p>${escape(message.text).replaceAll('\n', '<br>')}</p>
      <p><a href="${escape(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#143365;color:white;text-decoration:none;font-weight:bold">Sign in to AuricWell</a></p>` : null;
    const record = await log({ agencyId, templateType: CODEX_ASSISTANT_MAIL_TYPE, subject, body: html || text,
      recipientAddress: to, metadata: { actorType: 'automation', actorKey: 'codex_assistant', automationSubject: principal,
        requestId, senderIdentityId: sender.id, fromEmail: from, replyTo: replyTo || from, cc, ...(bcc.length ? { bcc } : {}), source: 'manual' } });
    if (!record?.id) throw new Error('No communication receipt was created');
    communicationId = record.id;
    await db.execute('UPDATE codex_assistant_mail_deliveries SET communication_id=? WHERE request_id=?', [communicationId, requestId]);
    // Once transport is attempted a timeout gives no evidence that mail was unsent.
    status = 'delivery_unknown';
    const result = await send({ senderIdentityId: sender.id, source: 'manual', templateType: CODEX_ASSISTANT_MAIL_TYPE,
      existingCommunicationId: communicationId, preloggedReceipt: true, to, cc: cc.join(', ') || null, bcc: bcc.join(', ') || null, subject, text, html,
      replyToOverride: replyTo || from });
    if (result?.id && !result.queued && !result.pendingApproval && !result.blocked && !result.skipped && !result.redirected && !result.relay?.partial && !result.relay?.rejectedCount) {
      status = 'sent';
    } else if (result?.queued || result?.pendingApproval || result?.blocked || result?.skipped || result?.redirected) {
      status = 'held';
    }
  } catch {
    // Keep the durable claim. An unresolved receipt is reviewed before any resend.
  }
  await db.execute('UPDATE codex_assistant_mail_deliveries SET status=? WHERE request_id=?', [status, requestId]);
  return receipt({ request_id: requestId, status, communication_id: communicationId });
}
