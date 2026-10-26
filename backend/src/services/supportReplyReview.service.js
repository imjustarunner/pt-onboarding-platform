import crypto from 'node:crypto';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { decryptTicketRow, decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import {
  assertReviewAccess, buildReviewNotice, deliveryState, hashReviewKey, latestDueReviewDate,
  localParts, normalizePilotConfig, reviewError, reviewWindow, shiftDate, isWeekday
} from '../utils/supportReplyReview.shared.js';

const sqlDate = (value) => new Date(value).toISOString().slice(0, 23).replace('T', ' ');
const parseJson = (value, fallback = null) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const id = (value) => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const clipped = (value, size) => value == null ? null : String(value).slice(0, size);
const inWindow = (date, window) => new Date(date) >= new Date(window.start) && new Date(date) < new Date(window.end);

async function defaultSendNotice({ config, reviewer, notice, digestId }) {
  const { sendNotificationEmail } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  return sendNotificationEmail({
    agencyId: config.agencyId, triggerKey: 'daily_digest', to: reviewer.email,
    subject: notice.subject, text: notice.text, userId: config.reviewerUserId,
    templateType: 'support_reply_pilot_review', templateId: digestId, source: 'auto'
  });
}

/** Dependency injection keeps all verification local: tests never open a DB or send email. */
export function createSupportReplyReviewService({ db: injectedDb, encrypt = encryptChatText, decrypt = decryptChatText, sendNotice = defaultSendNotice, now = () => new Date() } = {}) {
  const database = async () => injectedDb || (await import('../config/database.js')).default;
  const seal = (payload) => {
    try { return JSON.stringify(encrypt(JSON.stringify(payload))); }
    catch { throw reviewError('Encrypted support review storage is unavailable', 503, 'support_review_encryption_unavailable'); }
  };
  const open = (row) => {
    try { return { ...JSON.parse(decrypt(parseJson(row.payload_encrypted))), readable: true }; }
    catch { return { readable: false, body: null, originalReceived: null }; }
  };

  async function getConfig(agencyId) {
    const db = await database();
    const [rows] = await db.execute('SELECT * FROM support_reply_pilot_config WHERE agency_id = ? LIMIT 1', [id(agencyId)]);
    return rows[0] ? normalizePilotConfig(rows[0]) : null;
  }

  async function authorize(user, agencyId, { write = false } = {}) {
    const db = await database();
    const config = await getConfig(agencyId);
    const [memberships] = user?.role === 'super_admin' ? [[]] : await db.execute('SELECT agency_id FROM user_agencies WHERE user_id = ? AND is_active = TRUE', [id(user?.id)]);
    assertReviewAccess({ user, agencyId, memberAgencyIds: memberships.map((r) => r.agency_id), config, write });
    return config;
  }

  async function saveConfig(input, user) {
    const config = normalizePilotConfig(input);
    await authorize(user, config.agencyId, { write: true });
    const db = await database();
    const users = [...new Set([config.reviewerUserId, ...config.pilotUserIds])];
    const [members] = await db.execute(`SELECT DISTINCT ua.user_id FROM user_agencies ua JOIN users u ON u.id = ua.user_id
      WHERE ua.agency_id = ? AND ua.is_active = TRUE AND u.is_active = TRUE AND ua.user_id IN (${users.map(() => '?').join(',')})`, [config.agencyId, ...users]);
    if (users.some((userId) => !members.some((r) => Number(r.user_id) === userId))) throw reviewError('Reviewer and pilot staff must belong to this agency', 400);
    await db.execute(`INSERT INTO support_reply_pilot_config
      (agency_id, reviewer_user_id, pilot_user_ids_json, time_zone, send_time, weekdays_only, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE reviewer_user_id = VALUES(reviewer_user_id), pilot_user_ids_json = VALUES(pilot_user_ids_json),
      time_zone = VALUES(time_zone), send_time = VALUES(send_time), weekdays_only = VALUES(weekdays_only), is_enabled = VALUES(is_enabled)`,
    [config.agencyId, config.reviewerUserId, JSON.stringify(config.pilotUserIds), config.timeZone, config.sendTime, config.weekdaysOnly ? 1 : 0, config.enabled ? 1 : 0]);
    return getConfig(config.agencyId);
  }

  async function sourceContext(input) {
    const db = await database();
    const ticketId = id(input.ticketId);
    const agencyId = id(input.agencyId);
    const [tickets] = await db.execute('SELECT * FROM support_tickets WHERE id = ? AND agency_id = ? LIMIT 1', [ticketId, agencyId]);
    if (!tickets[0]) throw reviewError('Ticket not found in this agency', 404);
    const ticket = decryptTicketRow(tickets[0]);
    const [[latest]] = await db.execute('SELECT COALESCE(MAX(id), 0) AS revision FROM support_ticket_messages WHERE ticket_id = ? AND COALESCE(is_deleted, 0) = 0', [ticketId]);
    const threadRevision = String(latest?.revision || 0);
    if (input.threadRevision != null && String(input.threadRevision) !== threadRevision && !input.allowHistoricalRevision) throw reviewError('Conversation changed; refresh the draft', 409, 'support_review_stale_draft');
    const sourceClause = input.sourceMessageId != null && id(input.sourceMessageId) ? ' AND e.ticket_message_id = ?' : '';
    const [messages] = await db.execute(`SELECT m.*, e.internet_message_id, e.gmail_message_id, COALESCE(e.sent_at, m.created_at) AS received_at
      FROM support_ticket_email_messages e JOIN support_ticket_messages m ON m.id = e.ticket_message_id
      WHERE e.ticket_id = ? AND e.agency_id = ? AND e.direction = 'inbound' AND COALESCE(m.is_deleted, 0) = 0${sourceClause}
      ORDER BY COALESCE(e.sent_at, m.created_at) DESC, m.id DESC LIMIT 1`, [ticketId, agencyId, ...(sourceClause ? [id(input.sourceMessageId)] : [])]);
    const message = messages[0] ? decryptTicketMessageRow(messages[0]) : null;
    if ((message?.body ?? ticket.question) === '[Unable to decrypt]') throw reviewError('Original email evidence cannot be decrypted', 503, 'support_review_source_unavailable');
    return {
      ticket, threadRevision,
      originalReceived: {
        body: message?.body ?? ticket.question ?? '',
        receivedAt: message?.received_at || ticket.source_email_received_at || ticket.created_at,
        sourceMessageId: message?.id || ticket.source_email_message_id || null,
        internetMessageId: message?.internet_message_id || ticket.source_email_message_id || null,
        gmailMessageId: message?.gmail_message_id || null,
        subject: ticket.source_email_subject || ticket.subject || ''
      }
    };
  }

  function mapSnapshot(row) {
    if (!row) return null;
    const payload = open(row);
    return {
      id: Number(row.id), kind: row.snapshot_kind, ticketId: Number(row.ticket_id), agencyId: Number(row.agency_id),
      actorUserId: id(row.actor_user_id), draftSnapshotId: id(row.draft_snapshot_id), ticketMessageId: id(row.ticket_message_id),
      sourceMessageId: row.source_message_id, threadRevision: row.thread_revision,
      status: row.delivery_status, transportMessageId: row.transport_message_id, communicationId: id(row.communication_id),
      model: row.model_name, provider: row.provider_name, errorCode: row.error_code,
      createdAt: row.occurred_at, occurredAt: row.occurred_at, ...payload
    };
  }

  async function insertSnapshot(input, payload) {
    const db = await database();
    const requestKey = hashReviewKey(`${input.kind}:${input.idempotencyKey || input.requestKey || crypto.randomUUID()}:${input.deliveryStatus || ''}`);
    // Check idempotence before encryption. A replay must return exactly the original evidence.
    const [existing] = await db.execute('SELECT * FROM support_reply_review_snapshots WHERE agency_id = ? AND request_key = ? LIMIT 1', [id(input.agencyId), requestKey]);
    if (existing[0]) return mapSnapshot(existing[0]);
    const encrypted = seal(payload);
    await db.execute(`INSERT INTO support_reply_review_snapshots
      (agency_id, ticket_id, snapshot_kind, actor_user_id, draft_snapshot_id, ticket_message_id, source_message_id,
      thread_revision, delivery_status, transport_message_id, communication_id, model_name, provider_name, error_code,
      request_key, payload_encrypted, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [
      id(input.agencyId), id(input.ticketId), input.kind, id(input.actorUserId), id(input.draftSnapshotId), id(input.ticketMessageId),
      clipped(input.sourceMessageId, 255), clipped(input.threadRevision, 100), clipped(input.deliveryStatus, 24),
      clipped(input.transportMessageId, 998), id(input.communicationId), clipped(input.model, 150), clipped(input.provider, 100),
      clipped(input.errorCode, 100), requestKey, encrypted, sqlDate(input.occurredAt || now())
    ]);
    const [rows] = await db.execute('SELECT * FROM support_reply_review_snapshots WHERE agency_id = ? AND request_key = ? LIMIT 1', [id(input.agencyId), requestKey]);
    return mapSnapshot(rows[0]);
  }

  async function recordDraftSnapshot(input) {
    if (!String(input.body || '').trim()) throw reviewError('Draft body is required');
    const source = await sourceContext(input);
    const snapshot = await insertSnapshot({ ...input, kind: 'draft', sourceMessageId: source.originalReceived.sourceMessageId, threadRevision: source.threadRevision }, {
      body: String(input.body), originalReceived: source.originalReceived,
      sourceEvidence: input.sourceEvidence || [], generatedOnly: true
    });
    return { ...snapshot, draftSnapshotId: snapshot.id };
  }

  async function getLatestDraftSnapshot(input) {
    const db = await database();
    const clauses = ["snapshot_kind = 'draft'", 'ticket_id = ?', 'agency_id = ?'];
    const params = [id(input.ticketId), id(input.agencyId)];
    if (input.actorUserId) { clauses.push('(actor_user_id = ? OR actor_user_id IS NULL)'); params.push(id(input.actorUserId)); }
    else if (input.automaticOnly) clauses.push('actor_user_id IS NULL');
    if (input.threadRevision != null) { clauses.push('thread_revision = ?'); params.push(String(input.threadRevision)); }
    if (input.sourceMessageId != null) { clauses.push('source_message_id = ?'); params.push(String(input.sourceMessageId)); }
    if (input.occurredAt) { clauses.push('occurred_at <= ?'); params.push(sqlDate(input.occurredAt)); }
    const [rows] = await db.execute(`SELECT * FROM support_reply_review_snapshots WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 1`, params);
    return mapSnapshot(rows[0]);
  }

  async function resolveDraftSnapshotForSend(input) {
    if (!input.draftSnapshotId) return getLatestDraftSnapshot(input);
    const db = await database();
    const [rows] = await db.execute("SELECT * FROM support_reply_review_snapshots WHERE id = ? AND agency_id = ? AND ticket_id = ? AND snapshot_kind = 'draft' LIMIT 1", [id(input.draftSnapshotId), id(input.agencyId), id(input.ticketId)]);
    const snapshot = mapSnapshot(rows[0]);
    if (!snapshot) throw reviewError('Draft does not belong to this conversation', 409, 'support_review_wrong_draft');
    if (input.threadRevision != null && String(input.threadRevision) !== String(snapshot.threadRevision)) throw reviewError('Conversation changed after this draft; refresh before sending', 409, 'support_review_stale_draft');
    if (input.sourceMessageId != null && String(input.sourceMessageId) !== String(snapshot.sourceMessageId)) throw reviewError('Draft belongs to an earlier incoming email', 409, 'support_review_stale_draft');
    if (input.occurredAt && new Date(snapshot.occurredAt) > new Date(input.occurredAt)) throw reviewError('This draft was generated after the recorded reply', 409, 'support_review_future_draft');
    if (!snapshot.readable) throw reviewError('Draft evidence cannot be decrypted', 503);
    return snapshot;
  }

  async function captureSentReview(input) {
    const db = await database();
    let verifiedCommunicationSent = false;
    if (input.deliveryStatus === 'sent' && input.communicationId) {
      const [rows] = await db.execute("SELECT id FROM user_communications WHERE id = ? AND agency_id = ? AND delivery_status = 'sent' LIMIT 1", [id(input.communicationId), id(input.agencyId)]);
      verifiedCommunicationSent = !!rows[0];
    }
    const status = deliveryState({ ...input, verifiedCommunicationSent });
    const source = await sourceContext({ ...input, allowHistoricalRevision: true });
    const draft = await resolveDraftSnapshotForSend({ ...input, automaticOnly: !!input.external && !input.actorUserId, sourceMessageId: input.sourceMessageId ?? source.originalReceived.sourceMessageId });
    return insertSnapshot({ ...input, kind: input.external ? 'external_reply' : 'delivery', deliveryStatus: status,
      draftSnapshotId: draft?.id || null, sourceMessageId: input.sourceMessageId ?? source.originalReceived.sourceMessageId,
      threadRevision: input.threadRevision ?? draft?.threadRevision ?? source.threadRevision }, {
      body: String(input.body || ''), composedBody: input.composedBody == null ? null : String(input.composedBody), originalReceived: draft?.originalReceived || source.originalReceived,
      internetMessageId: input.internetMessageId || null, external: !!input.external, authorUnconfirmed: !id(input.actorUserId),
      sourceEvidence: input.sourceEvidence || [], missingDraft: !draft,
      deliveryEvidence: { transportMessageId: input.transportMessageId || null, communicationId: input.communicationId || null, verifiedCommunicationSent }
    });
  }

  // Explicit hook for external Gmail history reconciliation; a transcript alone
  // is not proof that every personal mailbox has been captured.
  async function captureExternalReplyReview(input) {
    if (!input.transportMessageId || !input.occurredAt) throw reviewError('External reply requires Gmail message evidence and original send time');
    return captureSentReview({ ...input, deliveryStatus: 'sent', external: true, idempotencyKey: input.idempotencyKey || `gmail:${input.transportMessageId}` });
  }

  async function getDeliveryReviewEvidence({ agencyId, ticketId, ticketMessageId }) {
    const db = await database();
    const [rows] = await db.execute("SELECT * FROM support_reply_review_snapshots WHERE agency_id = ? AND ticket_id = ? AND ticket_message_id = ? AND snapshot_kind = 'delivery' ORDER BY id DESC LIMIT 1", [id(agencyId), id(ticketId), id(ticketMessageId)]);
    return mapSnapshot(rows[0]);
  }

  async function dailyReview({ agencyId, date, config: suppliedConfig = null }) {
    const db = await database();
    const config = suppliedConfig || await getConfig(agencyId);
    if (!config) throw reviewError('Support email pilot is not configured for this agency', 404);
    const window = reviewWindow(date || localParts(now(), config.timeZone).date, config);
    const staffSlots = config.pilotUserIds.map(() => '?').join(',');
    const [tickets] = await db.execute(`SELECT t.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
      FROM support_tickets t LEFT JOIN users u ON u.id = t.claimed_by_user_id
      WHERE t.agency_id = ? AND t.source_channel = 'email' AND (
        EXISTS (SELECT 1 FROM support_reply_review_snapshots s WHERE s.ticket_id = t.id
          AND s.occurred_at >= ? AND s.occurred_at < ? AND (s.actor_user_id IN (${staffSlots}) OR (s.actor_user_id IS NULL AND t.claimed_by_user_id IN (${staffSlots}))))
        OR (t.claimed_by_user_id IN (${staffSlots}) AND t.source_email_received_at >= ? AND t.source_email_received_at < ?)
        OR EXISTS (SELECT 1 FROM support_ticket_email_messages e JOIN support_ticket_messages m ON m.id = e.ticket_message_id
          WHERE e.ticket_id = t.id AND COALESCE(e.sent_at, e.created_at) >= ? AND COALESCE(e.sent_at, e.created_at) < ? AND
          (m.author_user_id IN (${staffSlots}) OR (e.direction = 'inbound' AND t.claimed_by_user_id IN (${staffSlots})))))
      ORDER BY t.id DESC LIMIT 501`, [config.agencyId, sqlDate(window.start), sqlDate(window.end), ...config.pilotUserIds, ...config.pilotUserIds,
      ...config.pilotUserIds, sqlDate(window.start), sqlDate(window.end), sqlDate(window.start), sqlDate(window.end), ...config.pilotUserIds, ...config.pilotUserIds]);
    const limitedTickets = tickets.slice(0, 500);
    const ids = limitedTickets.map((t) => t.id);
    let snapshots = [], emailRows = [];
    if (ids.length) {
      const slots = ids.map(() => '?').join(',');
      [snapshots] = await db.execute(`SELECT * FROM support_reply_review_snapshots WHERE agency_id = ? AND ticket_id IN (${slots}) AND occurred_at < ? ORDER BY id ASC LIMIT 15001`, [config.agencyId, ...ids, sqlDate(window.end)]);
      [emailRows] = await db.execute(`SELECT e.*, m.body, m.body_ciphertext, m.body_iv, m.body_auth_tag, m.encryption_key_id, m.author_user_id
        FROM support_ticket_email_messages e JOIN support_ticket_messages m ON m.id = e.ticket_message_id
        WHERE e.agency_id = ? AND e.ticket_id IN (${slots}) AND COALESCE(e.sent_at, e.created_at) < ? ORDER BY COALESCE(e.sent_at, e.created_at) ASC, e.id ASC LIMIT 15001`, [config.agencyId, ...ids, sqlDate(window.end)]);
    }
    const totals = { tickets: limitedTickets.length, drafts: 0, sent: 0, failed: 0, queued: 0, sending: 0, unknown: 0, unsentDrafts: 0, externalReplies: 0, missingDraft: 0, unreadableSnapshots: 0 };
    const rows = limitedTickets.map((raw) => {
      const ticket = decryptTicketRow(raw);
      const events = snapshots.filter((s) => Number(s.ticket_id) === Number(ticket.id)).map(mapSnapshot);
      const allDrafts = events.filter((s) => s.kind === 'draft');
      const latestDelivery = new Map();
      for (const event of events.filter((s) => s.kind !== 'draft')) latestDelivery.set(event.ticketMessageId ? `message:${event.ticketMessageId}` : event.transportMessageId ? `transport:${event.transportMessageId}` : `event:${event.id}`, event);
      const deliveries = [...latestDelivery.values()].filter((s) => inWindow(s.occurredAt, window));
      const linkedMessages = new Set(events.map((s) => Number(s.ticketMessageId)).filter(Boolean));
      for (const email of emailRows.filter((e) => Number(e.ticket_id) === Number(ticket.id) && e.direction === 'outbound' && !linkedMessages.has(Number(e.ticket_message_id)) && inWindow(e.sent_at || e.created_at, window))) {
        const sentEvidence = email.send_status === 'sent' && (email.gmail_message_id || email.communication_id) && email.sent_at;
        deliveries.push({ id: `email:${email.id}`, ticketMessageId: Number(email.ticket_message_id), body: decryptTicketMessageRow(email).body,
          occurredAt: email.sent_at || email.created_at, status: sentEvidence ? 'sent' : email.send_status === 'sent' ? 'unknown' : email.send_status,
          actorUserId: id(email.author_user_id), draftSnapshotId: id(email.draft_snapshot_id), transportMessageId: email.gmail_message_id || null,
          errorCode: email.error_code, external: !!email.gmail_message_id && !email.communication_id, missingDraft: !email.draft_snapshot_id,
          immutableSnapshotMissing: true });
      }
      const relevantDrafts = allDrafts.filter((s) => inWindow(s.createdAt, window) || deliveries.some((d) => d.draftSnapshotId === s.id));
      const latestDraft = relevantDrafts.at(-1) || null;
      const sent = deliveries.filter((s) => s.status === 'sent').at(-1) || null;
      const comparisonDraft = sent ? allDrafts.find((s) => s.id === sent.draftSnapshotId) : latestDraft;
      // Compare a reply with the message it answered, even when no draft exists.
      // Later incoming mail must not replace the immutable received-email evidence.
      const latestInbound = emailRows.filter((e) => Number(e.ticket_id) === Number(ticket.id) && e.direction === 'inbound'
        && (!sent || new Date(e.sent_at || e.created_at) <= new Date(sent.occurredAt))).at(-1);
      const seedReceivedAt = ticket.source_email_received_at || ticket.created_at;
      const seedAvailable = !sent || (seedReceivedAt && new Date(seedReceivedAt) <= new Date(sent.occurredAt));
      const originalReceived = comparisonDraft?.originalReceived || sent?.originalReceived || (latestInbound
        ? { body: decryptTicketMessageRow(latestInbound).body, receivedAt: latestInbound.sent_at || latestInbound.created_at, sourceMessageId: latestInbound.ticket_message_id }
        : { body: seedAvailable ? ticket.question || '' : '', receivedAt: seedAvailable ? seedReceivedAt : null, sourceMessageId: seedAvailable ? ticket.source_email_message_id : null });
      const coverageFlags = [];
      if (deliveries.some((s) => s.immutableSnapshotMissing)) coverageFlags.push('delivery_snapshot_missing');
      if (events.some((s) => !s.readable)) coverageFlags.push('encrypted_evidence_unavailable');
      if (latestDraft && !deliveries.some((s) => s.status === 'sent' && s.draftSnapshotId === latestDraft.id)) { coverageFlags.push('latest_draft_not_sent'); totals.unsentDrafts += 1; }
      if (!relevantDrafts.length) coverageFlags.push('no_recorded_draft');
      if (!deliveries.length && (ticket.answer || ticket.sent_at)) coverageFlags.push('legacy_send_not_verified');
      totals.drafts += allDrafts.filter((s) => inWindow(s.createdAt, window)).length;
      totals.unreadableSnapshots += events.filter((s) => !s.readable).length;
      for (const delivery of deliveries) {
        if (Object.hasOwn(totals, delivery.status)) totals[delivery.status] += 1;
        if (delivery.external) totals.externalReplies += 1;
        if (!delivery.draftSnapshotId) totals.missingDraft += 1;
      }
      return { ticketId: Number(ticket.id), subject: ticket.subject, owner: { id: id(ticket.claimed_by_user_id), name: [ticket.owner_first_name, ticket.owner_last_name].filter(Boolean).join(' ') },
        originalReceived, draftSnapshots: relevantDrafts, deliveries, coverageFlags,
        comparison: { draftId: comparisonDraft?.id || null, generatedDraft: comparisonDraft?.body || null, sentBody: sent?.body || null,
          composedBody: sent?.composedBody ?? null,
          edited: sent && comparisonDraft ? sent.composedBody != null
            ? String(sent.composedBody).trim() !== String(comparisonDraft.body).trim()
            : String(sent.body).trim() === String(comparisonDraft.body).trim() ? false : null : null,
          missingDraft: !!sent && !comparisonDraft } };
    });
    const [digests] = await db.execute('SELECT * FROM support_reply_review_digests WHERE agency_id = ? AND local_date = ? LIMIT 1', [config.agencyId, window.date]);
    return { config, window, rows, totals, digest: digests[0] || null, coverage: {
      completeMailboxCoverage: false, personalMailboxReplies: 'Only explicitly linked Gmail evidence is included; personal mailbox bypass may be missing.',
      historicalDrafts: 'Drafts generated before immutable capture are unavailable; the review does not reconstruct them.',
      truncated: tickets.length > 500 || snapshots.length > 15000 || emailRows.length > 15000,
      scheduledCutoff: config.sendTime, inProgress: new Date(window.end) > now()
    } };
  }

  async function processDigest(config, date) {
    const db = await database();
    const window = reviewWindow(date, config);
    await db.execute(`INSERT INTO support_reply_review_digests (agency_id, reviewer_user_id, local_date, time_zone, window_start, window_end)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [config.agencyId, config.reviewerUserId, date, config.timeZone, sqlDate(window.start), sqlDate(window.end)]);
    const [digestRows] = await db.execute('SELECT * FROM support_reply_review_digests WHERE agency_id = ? AND local_date = ? LIMIT 1', [config.agencyId, date]);
    const digest = digestRows[0];
    if (!digest) throw reviewError('Unable to reserve review digest', 503);
    // Durable claim across processes. Never blindly retry a send after an unknown result.
    const claimToken = crypto.randomUUID();
    const [claim] = await db.execute("UPDATE support_reply_review_digests SET status = 'building', claimed_at = ?, claim_token = ? WHERE id = ? AND status IN ('pending', 'failed') AND attempted_at IS NULL", [sqlDate(now()), claimToken, digest.id]);
    if (!claim.affectedRows) return { id: digest.id, status: digest.status, duplicate: true };
    let attempted = false;
    try {
      const review = await dailyReview({ agencyId: config.agencyId, date, config });
      const [[reviewer]] = await db.execute('SELECT u.id, u.email FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? AND ua.is_active = TRUE WHERE u.id = ? AND u.is_active = TRUE LIMIT 1', [config.agencyId, config.reviewerUserId]);
      const [[agency]] = await db.execute('SELECT slug FROM agencies WHERE id = ? LIMIT 1', [config.agencyId]);
      if (!reviewer?.email || !agency?.slug) throw reviewError('Reviewer membership, email, or agency route is unavailable', 409, 'support_review_recipient_unavailable');
      const base = String(process.env.FRONTEND_URL || 'https://app.itsco.health').replace(/\/$/, '');
      const url = `${base}/${encodeURIComponent(agency.slug)}/admin/support-review?date=${encodeURIComponent(date)}`;
      const notice = buildReviewNotice({ date, url });
      // Fence expired workers before either notification or transport side effect.
      const [deliveryClaim] = await db.execute("UPDATE support_reply_review_digests SET counts_json = ?, status = 'sending', attempted_at = ? WHERE id = ? AND status = 'building' AND claim_token = ?", [JSON.stringify(review.totals), sqlDate(now()), digest.id, claimToken]);
      if (!deliveryClaim.affectedRows) return { id: digest.id, status: 'lease_lost' };
      attempted = true;
      let notificationId = digest.notification_id;
      if (!notificationId) {
        const [noticeRows] = await db.execute("SELECT id FROM notifications WHERE user_id = ? AND agency_id = ? AND related_entity_type = 'support_reply_review_digest' AND related_entity_id = ? LIMIT 1", [config.reviewerUserId, config.agencyId, digest.id]);
        notificationId = noticeRows[0]?.id;
        if (!notificationId) {
          const [notification] = await db.execute(`INSERT INTO notifications (type, severity, title, message, user_id, agency_id, related_entity_type, related_entity_id, actor_source)
            VALUES ('support_reply_pilot_review', 'info', ?, ?, ?, ?, 'support_reply_review_digest', ?, 'support_reply_pilot_scheduler')`, [notice.subject, notice.text, config.reviewerUserId, config.agencyId, digest.id]);
          notificationId = notification.insertId;
        }
      }
      await db.execute('UPDATE support_reply_review_digests SET notification_id = ? WHERE id = ? AND claim_token = ?', [notificationId, digest.id, claimToken]);
      const result = await sendNotice({ config, reviewer, notice, digestId: digest.id });
      const communicationId = id(result?.communicationId || result?.userCommunicationId);
      const transportMessageId = result?.id || result?.messageId || result?.providerMessageId || result?.gmailMessageId || null;
      let verifiedSent = false;
      if (communicationId) {
        const [receipts] = await db.execute("SELECT id FROM user_communications WHERE id = ? AND agency_id = ? AND delivery_status = 'sent' LIMIT 1", [communicationId, config.agencyId]);
        verifiedSent = !!receipts[0];
      }
      const status = result?.redirected ? 'redirected' : result?.queued || result?.queuedForApproval || result?.pendingApproval ? 'queued' : result?.skipped || result?.blocked ? 'skipped' : transportMessageId || verifiedSent ? 'sent' : 'unknown';
      await db.execute('UPDATE support_reply_review_digests SET status = ?, communication_id = ?, transport_message_id = ?, error_code = ?, completed_at = ? WHERE id = ? AND claim_token = ?', [status, communicationId, clipped(transportMessageId, 998), clipped(result?.reason || null, 100), sqlDate(now()), digest.id, claimToken]);
      return { id: digest.id, status };
    } catch (error) {
      await db.execute('UPDATE support_reply_review_digests SET status = ?, error_code = ?, completed_at = ? WHERE id = ? AND claim_token = ?', [attempted ? 'unknown' : 'failed', clipped(error.code || 'support_review_digest_failed', 100), sqlDate(now()), digest.id, claimToken]);
      return { id: digest.id, status: attempted ? 'unknown' : 'failed' };
    }
  }

  async function runDigestTick() {
    const db = await database();
    // A crashed build can be retried before any delivery attempt. An uncertain
    // transport outcome stays visible for manual reconciliation, never auto-resends.
    const stale = sqlDate(new Date(now().getTime() - 15 * 60 * 1000));
    await db.execute("UPDATE support_reply_review_digests SET status = 'pending' WHERE status = 'building' AND attempted_at IS NULL AND claimed_at < ?", [stale]);
    await db.execute("UPDATE support_reply_review_digests SET status = 'unknown', error_code = 'delivery_outcome_unconfirmed' WHERE status = 'sending' AND attempted_at < ?", [stale]);
    await db.execute(`UPDATE support_reply_review_digests d JOIN user_communications c ON c.id = d.communication_id AND c.agency_id = d.agency_id
      SET d.status = CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.testInboxRedirect')) IN ('true', '1')
        THEN 'redirected' ELSE c.delivery_status END, d.completed_at = CURRENT_TIMESTAMP
      WHERE d.status = 'queued' AND (c.delivery_status IN ('failed', 'skipped')
        OR (c.delivery_status = 'sent' AND c.external_message_id IS NOT NULL))`);
    const [configs] = await db.execute('SELECT * FROM support_reply_pilot_config WHERE is_enabled = TRUE');
    const results = [];
    for (const raw of configs) {
      const config = normalizePilotConfig(raw);
      const lastDue = latestDueReviewDate(now(), config);
      const [retryRows] = await db.execute("SELECT local_date FROM support_reply_review_digests WHERE agency_id = ? AND status IN ('pending', 'failed') AND attempted_at IS NULL AND local_date <= ? ORDER BY local_date LIMIT 14", [config.agencyId, lastDue]);
      for (const retry of retryRows) results.push(await processDigest(config, typeof retry.local_date === 'string' ? retry.local_date.slice(0, 10) : retry.local_date.toISOString().slice(0, 10)));
      const [latestRows] = await db.execute('SELECT local_date FROM support_reply_review_digests WHERE agency_id = ? ORDER BY local_date DESC LIMIT 1', [config.agencyId]);
      const latest = latestRows[0]?.local_date;
      let date = latest ? shiftDate(typeof latest === 'string' ? latest.slice(0, 10) : latest.toISOString().slice(0, 10), 1) : localParts(config.createdAt || now(), config.timeZone).date;
      // Bound startup catch-up while preserving a durable cursor for the next tick.
      for (let count = 0; date <= lastDue && count < 14; date = shiftDate(date, 1), count += 1) {
        if (config.weekdaysOnly && !isWeekday(date)) continue;
        results.push(await processDigest(config, date));
      }
    }
    return results;
  }

  return { getConfig, authorize, saveConfig, recordDraftSnapshot, getLatestDraftSnapshot, resolveDraftSnapshotForSend,
    captureSentReview, captureExternalReplyReview, getDeliveryReviewEvidence, dailyReview, processDigest, runDigestTick };
}

const service = createSupportReplyReviewService();
export const recordDraftSnapshot = (...args) => service.recordDraftSnapshot(...args);
export const getLatestDraftSnapshot = (...args) => service.getLatestDraftSnapshot(...args);
export const resolveDraftSnapshotForSend = (...args) => service.resolveDraftSnapshotForSend(...args);
export const captureSentReview = (...args) => service.captureSentReview(...args);
export const captureExternalReplyReview = (...args) => service.captureExternalReplyReview(...args);
export const getDeliveryReviewEvidence = (...args) => service.getDeliveryReviewEvidence(...args);
export const runSupportReplyReviewDigestTick = (...args) => service.runDigestTick(...args);
export default service;
