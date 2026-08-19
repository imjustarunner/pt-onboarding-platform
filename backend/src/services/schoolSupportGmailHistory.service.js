import pool from '../config/database.js';
import { getGmailClient, getImpersonatedUser } from './unifiedEmail/gmailClient.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { listAgencySchoolGroupEmails } from './unifiedEmail/schoolEmailInboundSync.service.js';
import {
  pairThreadStaffReplies,
  truncateText
} from '../utils/gmailMessageParse.shared.js';
import {
  buildTicketAnswerEmbeddingDocument,
  deidentifySchoolReplyText
} from '../utils/schoolSupportReplyRetrieval.shared.js';
import { inferIntentFromTicket, normalizeIntentKey } from '../utils/schoolSupportReplyLibrary.shared.js';
import { indexGmailSentPairForRetrieval } from './schoolSupportReplyRetrieval.service.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueEmails(list) {
  return Array.from(new Set((list || []).map(normalizeEmail).filter((e) => e.includes('@'))));
}

async function listOurSchoolReplyEmails(agencyId) {
  const emails = new Set();
  emails.add(normalizeEmail(getImpersonatedUser()));
  emails.add('schoolreply@itsco.health');
  emails.add('schools@itsco.health');

  try {
    const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'schoolreply')
      || await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'school_reply');
    if (identity?.from_email) emails.add(normalizeEmail(identity.from_email));
    if (identity?.reply_to) emails.add(normalizeEmail(identity.reply_to));
    const inbound = Array.isArray(identity?.inbound_addresses_json)
      ? identity.inbound_addresses_json
      : (typeof identity?.inbound_addresses_json === 'string'
        ? JSON.parse(identity.inbound_addresses_json || '[]')
        : []);
    for (const addr of inbound || []) emails.add(normalizeEmail(addr));
  } catch {
    // ignore
  }

  const [rows] = await pool.execute(
    `SELECT from_email, reply_to
     FROM email_sender_identities
     WHERE agency_id = ?
       AND LOWER(identity_key) IN ('schoolreply', 'school_reply')`,
    [Number(agencyId)]
  );
  for (const row of rows || []) {
    if (row.from_email) emails.add(normalizeEmail(row.from_email));
    if (row.reply_to) emails.add(normalizeEmail(row.reply_to));
  }

  return uniqueEmails([...emails]);
}

async function buildSchoolEmailIndex(agencyId) {
  const schools = await listAgencySchoolGroupEmails(agencyId);
  const byEmail = new Map();
  for (const school of schools) {
    if (school.itscoEmail) byEmail.set(school.itscoEmail, school.schoolOrganizationId);
  }

  const [contactRows] = await pool.execute(
    `SELECT sc.email, sc.school_organization_id
     FROM school_contacts sc
     JOIN organization_affiliations oa
       ON oa.organization_id = sc.school_organization_id
      AND oa.is_active = TRUE
     WHERE oa.agency_id = ?
       AND sc.email IS NOT NULL
       AND TRIM(sc.email) <> ''`,
    [Number(agencyId)]
  );
  for (const row of contactRows || []) {
    const em = normalizeEmail(row.email);
    if (em && !byEmail.has(em)) byEmail.set(em, Number(row.school_organization_id));
  }
  return byEmail;
}

function resolveSchoolOrganizationId(schoolEmailIndex, emails = []) {
  for (const em of emails) {
    const hit = schoolEmailIndex.get(normalizeEmail(em));
    if (hit) return hit;
  }
  return null;
}

async function isGmailPairAlreadyIndexed(agencyId, gmailMessageId) {
  const sourceRef = `gmail:${String(gmailMessageId || '').trim()}`;
  if (!sourceRef || sourceRef === 'gmail:') return false;
  const [rows] = await pool.execute(
    `SELECT id
     FROM school_support_reply_embeddings
     WHERE agency_id = ?
       AND source_ref = ?
     LIMIT 1`,
    [Number(agencyId), sourceRef]
  );
  return !!(rows?.[0]?.id);
}

function buildGmailSearchQuery(fromEmails) {
  const fromParts = uniqueEmails(fromEmails).map((e) => `from:${e}`);
  if (!fromParts.length) return 'in:sent';
  return `in:sent (${fromParts.join(' OR ')})`;
}

async function fetchThreadMessages(gmail, threadId) {
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });
  return thread.data?.messages || [];
}

/**
 * Backfill semantic retrieval corpus from Gmail Sent mail for schoolreply identities.
 * Pairs each staff outbound with the prior inbound school message in the thread.
 */
export async function backfillSchoolReplyGmailHistory({
  agencyId,
  maxMessages = 100,
  maxThreads = 80,
  skipExisting = true
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { skipped: 'invalid_agency', indexed: 0, scanned: 0, failed: 0 };

  const ourEmails = await listOurSchoolReplyEmails(aid);
  const schoolEmailIndex = await buildSchoolEmailIndex(aid);
  const gmail = await getGmailClient();
  const query = buildGmailSearchQuery(ourEmails);
  const lim = Math.max(1, Math.min(Number(maxMessages) || 100, 500));
  const threadLimit = Math.max(1, Math.min(Number(maxThreads) || 80, 300));

  let pageToken = null;
  let scanned = 0;
  let indexed = 0;
  let failed = 0;
  let skipped = 0;
  const seenThreads = new Set();

  do {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(50, lim - scanned),
      pageToken: pageToken || undefined
    });
    const messages = list.data?.messages || [];
    pageToken = list.data?.nextPageToken || null;

    for (const stub of messages) {
      if (scanned >= lim || seenThreads.size >= threadLimit) break;
      scanned += 1;
      const messageId = String(stub?.id || '').trim();
      const threadId = String(stub?.threadId || '').trim();
      if (!messageId || !threadId) continue;
      if (seenThreads.has(threadId)) continue;
      seenThreads.add(threadId);

      try {
        const threadMessages = await fetchThreadMessages(gmail, threadId);
        const pairs = pairThreadStaffReplies(threadMessages, ourEmails);
        for (const pair of pairs) {
          if (skipExisting && await isGmailPairAlreadyIndexed(aid, pair.gmailMessageId)) {
            skipped += 1;
            continue;
          }
          const schoolOrganizationId = resolveSchoolOrganizationId(schoolEmailIndex, [pair.schoolFromEmail].filter(Boolean));
          const intentKey = inferIntentFromTicket({
            subject: pair.subject,
            question: pair.questionBody
          });
          const searchText = buildTicketAnswerEmbeddingDocument({
            subject: pair.subject,
            question: pair.questionBody,
            answer: pair.answerBody,
            intentKey,
            scrubTerms: []
          });
          const replyExcerpt = deidentifySchoolReplyText(pair.answerBody);
          if (!searchText.trim() || replyExcerpt.length < 20) {
            skipped += 1;
            continue;
          }

          await indexGmailSentPairForRetrieval({
            agencyId: aid,
            schoolOrganizationId,
            intentKey,
            gmailMessageId: pair.gmailMessageId,
            title: truncateText(`Gmail reply: ${pair.subject}`, 240),
            searchText,
            replyExcerpt
          });
          indexed += 1;
        }
      } catch (err) {
        failed += 1;
        console.warn('[gmailHistoryBackfill] thread failed:', threadId, err?.message || err);
      }
    }
  } while (pageToken && scanned < lim && seenThreads.size < threadLimit);

  return {
    indexed,
    scanned,
    skipped,
    failed,
    threadsProcessed: seenThreads.size,
    query
  };
}
