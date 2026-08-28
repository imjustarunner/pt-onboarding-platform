import fs from 'fs';
import { createReadStream } from 'fs';
import { simpleParser } from 'mailparser';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import { ensurePersonalMailbox } from './personalMailbox.service.js';

const SKIP_LABELS = new Set(['spam', 'trash', 'drafts', 'draft']);

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, '');
}

function normalizeMessageId(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return v.replace(/^<|>$/g, '').toLowerCase();
}

function addressList(input) {
  if (!input) return [];
  const values = Array.isArray(input?.value) ? input.value : Array.isArray(input) ? input : [];
  return values
    .map((a) => ({
      email: normalizeEmail(a.address || a.email),
      name: a.name || null
    }))
    .filter((a) => a.email);
}

function parseLabels(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function labelSet(labels) {
  return new Set(labels.map((l) => l.toLowerCase()));
}

function shouldSkipLabels(labels) {
  const set = labelSet(labels);
  for (const skip of SKIP_LABELS) {
    if (set.has(skip)) return true;
  }
  // Gmail sometimes uses nested label names
  for (const lab of set) {
    if (lab.includes('spam') || lab.includes('trash') || lab === 'drafts' || lab.endsWith('/drafts')) {
      return true;
    }
  }
  return false;
}

function previewFromBodies(text, html) {
  return String(text || html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function collectUserEmails(user, mailboxFromEmail) {
  const set = new Set();
  for (const v of [user.email, user.work_email, user.personal_email, mailboxFromEmail]) {
    const e = normalizeEmail(v);
    if (e) set.add(e);
  }
  return set;
}

/**
 * Stream-split a classic mbox file into raw RFC822 message buffers.
 * Yields { index, raw } for each message.
 */
export async function* iterateMboxMessages(filePath) {
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  let pending = Buffer.alloc(0);
  let current = null;
  let index = 0;
  let started = false;

  const flush = () => {
    if (current && current.length) {
      const out = { index: index++, raw: Buffer.concat(current) };
      current = [];
      return out;
    }
    current = [];
    return null;
  };

  for await (const chunk of stream) {
    pending = Buffer.concat([pending, chunk]);
    // Process complete lines; keep incomplete trailing fragment
    while (true) {
      const nl = pending.indexOf(0x0a);
      if (nl < 0) break;
      let line = pending.subarray(0, nl + 1);
      pending = pending.subarray(nl + 1);

      const isFromLine =
        line.length >= 5 &&
        line[0] === 0x46 &&
        line[1] === 0x72 &&
        line[2] === 0x6f &&
        line[3] === 0x6d &&
        line[4] === 0x20; // "From "

      if (isFromLine) {
        if (started) {
          const msg = flush();
          if (msg) yield msg;
        }
        started = true;
        current = [];
        continue;
      }
      if (started) {
        current.push(line);
      }
    }
  }

  if (pending.length && started) {
    current.push(pending);
  }
  if (started) {
    const msg = flush();
    if (msg) yield msg;
  }
}

async function parseRawMessage(raw) {
  const parsed = await simpleParser(raw, {
    skipHtmlToText: false,
    skipTextToHtml: true,
    skipImageLinks: true
  });

  // Prefer headers for Gmail-specific fields (mailparser exposes them too)
  const getHeader = (name) => {
    const v = parsed.headers?.get(name);
    if (v == null) return null;
    if (Array.isArray(v)) return String(v[0] || '');
    if (typeof v === 'object' && v.text) return String(v.text);
    return String(v);
  };

  const labels = parseLabels(getHeader('x-gmail-labels'));
  const thrid = String(getHeader('x-gm-thrid') || '').trim() || null;
  const messageId = normalizeMessageId(parsed.messageId || getHeader('message-id'));
  const inReplyTo = normalizeMessageId(parsed.inReplyTo || getHeader('in-reply-to'));
  let referencesHeader = getHeader('references');
  if (!referencesHeader && Array.isArray(parsed.references)) {
    referencesHeader = parsed.references.join(' ');
  }

  return {
    messageId,
    inReplyTo,
    referencesHeader: referencesHeader || null,
    thrid,
    labels,
    subject: parsed.subject || '(no subject)',
    date: parsed.date || null,
    from: addressList(parsed.from)[0] || null,
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    bcc: addressList(parsed.bcc),
    bodyText: parsed.text || null,
    bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
    attachmentCount: Array.isArray(parsed.attachments) ? parsed.attachments.length : 0
  };
}

async function findExistingMessageId(internetMessageId) {
  if (!internetMessageId) return null;
  const [rows] = await pool.execute(
    `SELECT id, conversation_id FROM communication_messages
     WHERE internet_message_id = ? OR internet_message_id = ?
     LIMIT 1`,
    [internetMessageId, `<${internetMessageId}>`]
  );
  return rows[0] || null;
}

async function findConversationByExternalThread(agencyId, inboxId, externalThreadId) {
  if (!externalThreadId) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM communication_conversations
     WHERE agency_id = ? AND inbox_id = ? AND external_thread_id = ?
     LIMIT 1`,
    [agencyId, inboxId, externalThreadId]
  );
  return rows[0] || null;
}

async function setReadAt(conversationId, userId, lastReadAt) {
  await pool.execute(
    `INSERT INTO communication_conversation_reads (conversation_id, user_id, last_read_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_at = GREATEST(COALESCE(last_read_at, '1970-01-01'), VALUES(last_read_at))`,
    [conversationId, userId, lastReadAt]
  );
}

/**
 * Import a Google Takeout (or classic) mbox into a user's personal Communications inbox.
 *
 * @param {object} opts
 * @param {number} opts.agencyId
 * @param {number} opts.userId
 * @param {string} opts.filePath
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.skipSpamTrash=true]
 * @param {number} [opts.maxMessages] optional cap for testing
 * @param {(info: object) => void} [opts.onProgress]
 */
export async function importMboxToPersonalInbox({
  agencyId,
  userId,
  filePath,
  dryRun = false,
  skipSpamTrash = true,
  maxMessages = null,
  onProgress = null
} = {}) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  if (!aid || !uid) throw new Error('agencyId and userId are required');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('mbox file not found');

  const user = await User.findById(uid);
  if (!user) throw new Error('User not found');

  const inbox = dryRun
    ? (await ensurePersonalMailbox({ agencyId: aid, userId: uid })) || null
    : await ensurePersonalMailbox({ agencyId: aid, userId: uid });

  if (!inbox?.id) throw new Error('Could not provision personal inbox');

  const ownerEmails = collectUserEmails(user, inbox.from_email || inbox.fromEmail);

  const stats = {
    scanned: 0,
    skippedSpamTrash: 0,
    skippedDraft: 0,
    skippedDuplicate: 0,
    importedMessages: 0,
    createdConversations: 0,
    reusedConversations: 0,
    markedRead: 0,
    leftUnread: 0,
    attachmentsNoted: 0,
    errors: [],
    dateMin: null,
    dateMax: null,
    inboxId: inbox.id,
    mailboxEmail: inbox.from_email || inbox.fromEmail || null,
    dryRun: !!dryRun
  };

  // Thread accumulators for post-pass read state (conversationId -> meta)
  const threadMeta = new Map(); // externalThreadId -> { conversationId, hasUnread, lastAt, starred, archived }

  for await (const { index, raw } of iterateMboxMessages(filePath)) {
    if (maxMessages != null && stats.scanned >= maxMessages) break;
    stats.scanned += 1;

    let msg;
    try {
      msg = await parseRawMessage(raw);
    } catch (err) {
      stats.errors.push({ index, error: err.message || String(err) });
      continue;
    }

  const labelsLower = labelSet(msg.labels);
  if (labelsLower.has('drafts') || labelsLower.has('draft')) {
    stats.skippedDraft += 1;
    continue;
  }

  if (skipSpamTrash && shouldSkipLabels(msg.labels)) {
    stats.skippedSpamTrash += 1;
    continue;
  }

  if (msg.date) {
    const t = msg.date.getTime();
    if (!stats.dateMin || t < stats.dateMin.getTime()) stats.dateMin = msg.date;
    if (!stats.dateMax || t > stats.dateMax.getTime()) stats.dateMax = msg.date;
  }

  const isUnread = labelsLower.has('unread');
  const isStarred = labelsLower.has('starred') || labelsLower.has('important');
  const isArchived = labelsLower.has('archived') && !labelsLower.has('inbox');
  const fromEmail = normalizeEmail(msg.from?.email);
  const isOutbound = fromEmail && ownerEmails.has(fromEmail);

    const externalThreadId = msg.thrid
      ? `gmail:${msg.thrid}`
      : msg.messageId
        ? `mbox-msg:${msg.messageId}`
        : `mbox-idx:${aid}:${uid}:${index}`;

    if (typeof onProgress === 'function' && stats.scanned % 25 === 0) {
      onProgress({ ...stats, currentIndex: index, subject: msg.subject });
    }

    if (dryRun) {
      // Count as would-import; still check duplicates for report quality
      if (msg.messageId) {
        const existing = await findExistingMessageId(msg.messageId);
        if (existing) {
          stats.skippedDuplicate += 1;
          continue;
        }
      }
      stats.importedMessages += 1;
      stats.attachmentsNoted += msg.attachmentCount || 0;
      if (!threadMeta.has(externalThreadId)) {
        threadMeta.set(externalThreadId, {
          conversationId: null,
          hasUnread: false,
          lastAt: null,
          starred: false,
          archived: true
        });
        stats.createdConversations += 1;
      }
      const meta = threadMeta.get(externalThreadId);
      if (isUnread) meta.hasUnread = true;
      if (isStarred) meta.starred = true;
      if (!isArchived) meta.archived = false;
      const at = msg.date || new Date();
      if (!meta.lastAt || at > meta.lastAt) meta.lastAt = at;
      continue;
    }

    try {
      if (msg.messageId) {
        const existing = await findExistingMessageId(msg.messageId);
        if (existing) {
          stats.skippedDuplicate += 1;
          // Still track read/unread on existing thread
          let meta = threadMeta.get(externalThreadId);
          if (!meta) {
            meta = {
              conversationId: existing.conversation_id,
              hasUnread: false,
              lastAt: null,
              starred: false,
              archived: false
            };
            threadMeta.set(externalThreadId, meta);
          }
          if (isUnread) meta.hasUnread = true;
          continue;
        }
      }

      let conversation = await findConversationByExternalThread(aid, inbox.id, externalThreadId);
      let createdNow = false;
      if (!conversation) {
        conversation = await CommunicationConversation.create({
          agencyId: aid,
          inboxId: inbox.id,
          channel: 'email',
          subject: msg.subject,
          status: 'resolved',
          ownerUserId: uid,
          starred: isStarred,
          archivedAt: isArchived ? msg.date || new Date() : null,
          lastMessageAt: msg.date || new Date(),
          lastMessagePreview: previewFromBodies(msg.bodyText, msg.bodyHtml),
          externalThreadId
        });
        createdNow = true;
        stats.createdConversations += 1;

        // Seed primary participant (counterparty)
        const counterparty = isOutbound
          ? msg.to[0] || msg.cc[0] || null
          : msg.from;
        if (counterparty?.email) {
          await CommunicationConversation.upsertParticipant(conversation.id, {
            kind: 'email',
            email: counterparty.email,
            displayName: counterparty.name || null,
            isPrimary: true
          });
        }
      } else {
        stats.reusedConversations += 1;
        const updates = {};
        if (isStarred) updates.starred = true;
        // If any message is in Inbox, keep conversation unarchived
        if (!isArchived && conversation.archived_at) {
          updates.archivedAt = null;
        }
        if (Object.keys(updates).length) {
          await CommunicationConversation.update(conversation.id, updates);
        }
      }

      await CommunicationConversation.addMessage({
        conversationId: conversation.id,
        channel: 'email',
        direction: isOutbound ? 'outbound' : 'inbound',
        authorUserId: isOutbound ? uid : null,
        from: msg.from,
        to: msg.to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        bodyText: msg.bodyText,
        bodyHtml: msg.bodyHtml,
        internetMessageId: msg.messageId,
        inReplyTo: msg.inReplyTo,
        referencesHeader: msg.referencesHeader,
        sentAt: msg.date || new Date(),
        sendStatus: 'sent'
      });

      stats.importedMessages += 1;
      stats.attachmentsNoted += msg.attachmentCount || 0;

      let meta = threadMeta.get(externalThreadId);
      if (!meta) {
        meta = {
          conversationId: conversation.id,
          hasUnread: false,
          lastAt: null,
          starred: isStarred,
          archived: isArchived
        };
        threadMeta.set(externalThreadId, meta);
      }
      meta.conversationId = conversation.id;
      if (isUnread) meta.hasUnread = true;
      if (isStarred) meta.starred = true;
      if (!isArchived) meta.archived = false;
      const at = msg.date || new Date();
      if (!meta.lastAt || at > meta.lastAt) meta.lastAt = at;
    } catch (err) {
      stats.errors.push({
        index,
        messageId: msg.messageId,
        subject: msg.subject,
        error: err.message || String(err)
      });
    }
  }

  // Apply read state for imported threads
  if (!dryRun) {
    for (const meta of threadMeta.values()) {
      if (!meta.conversationId) continue;
      if (meta.hasUnread) {
        stats.leftUnread += 1;
        continue;
      }
      const readAt = meta.lastAt || new Date();
      await setReadAt(meta.conversationId, uid, readAt);
      stats.markedRead += 1;
    }
  } else {
    for (const meta of threadMeta.values()) {
      if (meta.hasUnread) stats.leftUnread += 1;
      else stats.markedRead += 1;
    }
  }

  return {
    ...stats,
    dateMin: stats.dateMin ? stats.dateMin.toISOString() : null,
    dateMax: stats.dateMax ? stats.dateMax.toISOString() : null,
    threadsTouched: threadMeta.size,
    note:
      'Spam and Trash are skipped by default. Attachment binaries are not uploaded; attachment counts are reported only. Read/unread comes from Gmail X-Gmail-Labels (Unread vs Opened).'
  };
}

export default {
  importMboxToPersonalInbox,
  iterateMboxMessages
};
