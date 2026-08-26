import pool from '../config/database.js';

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function mapMessage(row) {
  if (!row) return null;
  return {
    ...row,
    from: parseJson(row.from_json, null),
    to: parseJson(row.to_json, []),
    cc: parseJson(row.cc_json, []),
    bcc: parseJson(row.bcc_json, []),
    is_internal_note: !!row.is_internal_note
  };
}

class CommunicationConversation {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT c.*,
              i.display_name AS inbox_display_name,
              i.from_email AS inbox_from_email,
              i.sender_identity_id,
              u.first_name AS owner_first_name,
              u.last_name AS owner_last_name
       FROM communication_conversations c
       LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
       LEFT JOIN users u ON u.id = c.owner_user_id
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async findBySupportTicketId(ticketId) {
    const [rows] = await pool.execute(
      `SELECT * FROM communication_conversations WHERE support_ticket_id = ? LIMIT 1`,
      [ticketId]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO communication_conversations
       (agency_id, inbox_id, channel, subject, status, priority, owner_user_id, due_at, snoozed_until,
        starred, archived_at, support_ticket_id, last_message_at, last_message_preview, external_thread_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.agencyId ?? null,
        data.inboxId ?? null,
        data.channel || 'email',
        data.subject ?? null,
        data.status || 'new',
        data.priority || 'normal',
        data.ownerUserId ?? null,
        data.dueAt ?? null,
        data.snoozedUntil ?? null,
        data.starred ? 1 : 0,
        data.archivedAt ?? null,
        data.supportTicketId ?? null,
        data.lastMessageAt ?? null,
        data.lastMessagePreview ?? null,
        data.externalThreadId ?? null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const map = {
      inboxId: 'inbox_id',
      subject: 'subject',
      status: 'status',
      priority: 'priority',
      ownerUserId: 'owner_user_id',
      dueAt: 'due_at',
      snoozedUntil: 'snoozed_until',
      starred: 'starred',
      archivedAt: 'archived_at',
      draftBody: 'draft_body',
      draftUpdatedAt: 'draft_updated_at',
      lastMessageAt: 'last_message_at',
      lastMessagePreview: 'last_message_preview',
      externalThreadId: 'external_thread_id'
    };
    const fields = [];
    const values = [];
    for (const [k, col] of Object.entries(map)) {
      if (updates[k] !== undefined) {
        fields.push(`${col} = ?`);
        let v = updates[k];
        if (k === 'starred') v = v ? 1 : 0;
        values.push(v);
      }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE communication_conversations SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async list({
    agencyId,
    inboxId = null,
    channel = null,
    status = null,
    filter = 'all',
    ownerUserId = null,
    q = null,
    limit = 50,
    offset = 0,
    userId = null
  } = {}) {
    const where = ['c.archived_at IS NULL'];
    const params = [];
    if (agencyId != null) {
      where.push('(c.agency_id = ? OR c.agency_id IS NULL)');
      params.push(agencyId);
    }
    if (inboxId) {
      where.push('c.inbox_id = ?');
      params.push(inboxId);
    }
    if (channel && channel !== 'all') {
      where.push('c.channel = ?');
      params.push(channel);
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (ownerUserId) {
      where.push('c.owner_user_id = ?');
      params.push(ownerUserId);
    }
    if (q) {
      where.push('(c.subject LIKE ? OR c.last_message_preview LIKE ?)');
      const like = `%${String(q).trim()}%`;
      params.push(like, like);
    }

    const now = new Date();
    if (filter === 'needs_reply') {
      where.push(`c.status IN ('new', 'needs_reply')`);
      where.push('(c.snoozed_until IS NULL OR c.snoozed_until <= ?)');
      params.push(now);
    } else if (filter === 'unread' && userId) {
      where.push(`(
        c.last_message_at IS NOT NULL AND (
          NOT EXISTS (
            SELECT 1 FROM communication_conversation_reads r
            WHERE r.conversation_id = c.id AND r.user_id = ?
          )
          OR EXISTS (
            SELECT 1 FROM communication_conversation_reads r
            WHERE r.conversation_id = c.id AND r.user_id = ? AND r.last_read_at < c.last_message_at
          )
        )
      )`);
      params.push(userId, userId);
    } else if (filter === 'starred') {
      where.push('c.starred = 1');
    } else if (filter === 'snoozed') {
      where.push('c.snoozed_until IS NOT NULL AND c.snoozed_until > ?');
      params.push(now);
    } else if (filter === 'assigned' && userId) {
      where.push('c.owner_user_id = ?');
      params.push(userId);
    } else if (filter === 'waiting') {
      where.push(`c.status = 'waiting_on_them'`);
    } else if (filter === 'follow_up') {
      where.push(`(c.status = 'follow_up' OR (c.due_at IS NOT NULL AND c.due_at <= ? AND c.status <> 'resolved'))`);
      params.push(now);
    } else {
      // default active: hide future-snoozed
      where.push('(c.snoozed_until IS NULL OR c.snoozed_until <= ?)');
      params.push(now);
    }

    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);

    const [rows] = await pool.execute(
      `SELECT c.*,
              i.display_name AS inbox_display_name,
              i.from_email AS inbox_from_email,
              u.first_name AS owner_first_name,
              u.last_name AS owner_last_name,
              (
                SELECT p.display_name FROM communication_participants p
                WHERE p.conversation_id = c.id AND p.is_primary = 1
                ORDER BY p.id ASC LIMIT 1
              ) AS primary_participant_name,
              (
                SELECT p.email FROM communication_participants p
                WHERE p.conversation_id = c.id AND p.is_primary = 1
                ORDER BY p.id ASC LIMIT 1
              ) AS primary_participant_email
              ${userId ? `, (
                SELECT r.last_read_at FROM communication_conversation_reads r
                WHERE r.conversation_id = c.id AND r.user_id = ${Number(userId)}
                LIMIT 1
              ) AS last_read_at` : ''}
       FROM communication_conversations c
       LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
       LEFT JOIN users u ON u.id = c.owner_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return rows.map((r) => ({
      ...r,
      starred: !!r.starred,
      is_unread: userId
        ? !!(r.last_message_at && (!r.last_read_at || new Date(r.last_read_at) < new Date(r.last_message_at)))
        : false
    }));
  }

  static async attentionSummary({ agencyId, userId } = {}) {
    const now = new Date();
    const agencyClause = agencyId != null ? '(agency_id = ? OR agency_id IS NULL)' : '1=1';
    const paramsBase = agencyId != null ? [agencyId] : [];

    const count = async (extra, extraParams = []) => {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS n FROM communication_conversations
         WHERE archived_at IS NULL AND ${agencyClause} AND ${extra}`,
        [...paramsBase, ...extraParams]
      );
      return Number(rows[0]?.n || 0);
    };

    const needsAttention = await count(
      `status IN ('new', 'needs_reply') AND (snoozed_until IS NULL OR snoozed_until <= ?)`,
      [now]
    );
    const waitingOnOthers = await count(`status = 'waiting_on_them'`);
    const followUpsDue = await count(
      `(status = 'follow_up' OR (due_at IS NOT NULL AND due_at <= ?)) AND status <> 'resolved' AND (snoozed_until IS NULL OR snoozed_until <= ?)`,
      [now, now]
    );
    const assignedToYou = userId
      ? await count(`owner_user_id = ? AND status <> 'resolved'`, [userId])
      : 0;

    const [channelRows] = await pool.execute(
      `SELECT channel, COUNT(*) AS n
       FROM communication_conversations
       WHERE archived_at IS NULL AND ${agencyClause}
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
       GROUP BY channel`,
      [...paramsBase, now]
    );
    const channels = Object.fromEntries((channelRows || []).map((r) => [r.channel, Number(r.n || 0)]));

    return {
      needsAttention,
      waitingOnOthers,
      followUpsDue,
      assignedToYou,
      channels: {
        email: channels.email || 0,
        secure: channels.secure || 0,
        sms: channels.sms || 0,
        call: (channels.call || 0) + (channels.voicemail || 0),
        voicemail: channels.voicemail || 0,
        mention: channels.mention || 0,
        internal: channels.internal || 0,
        all: Object.values(channels).reduce((a, b) => a + b, 0)
      }
    };
  }

  static async markRead(conversationId, userId) {
    await pool.execute(
      `INSERT INTO communication_conversation_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_at = NOW()`,
      [conversationId, userId]
    );
  }

  static async markUnread(conversationId, userId) {
    await pool.execute(
      `DELETE FROM communication_conversation_reads WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId]
    );
  }

  static async listParticipants(conversationId) {
    const [rows] = await pool.execute(
      `SELECT * FROM communication_participants WHERE conversation_id = ? ORDER BY is_primary DESC, id ASC`,
      [conversationId]
    );
    return rows;
  }

  static async upsertParticipant(conversationId, data) {
    const [result] = await pool.execute(
      `INSERT INTO communication_participants
       (conversation_id, kind, email, display_name, linked_entity_type, linked_entity_id, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId,
        data.kind || 'email',
        data.email ?? null,
        data.displayName ?? null,
        data.linkedEntityType ?? null,
        data.linkedEntityId ?? null,
        data.isPrimary ? 1 : 0
      ]
    );
    return result.insertId;
  }

  static async listLinks(conversationId) {
    const [rows] = await pool.execute(
      `SELECT * FROM communication_links WHERE conversation_id = ? ORDER BY id ASC`,
      [conversationId]
    );
    return rows;
  }

  static async upsertLink(conversationId, entityType, entityId, label = null) {
    await pool.execute(
      `INSERT INTO communication_links (conversation_id, entity_type, entity_id, label)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = COALESCE(VALUES(label), label)`,
      [conversationId, entityType, entityId, label]
    );
  }

  static async listMessages(conversationId, { limit = 200 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const [rows] = await pool.execute(
      `SELECT m.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name
       FROM communication_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.conversation_id = ?
       ORDER BY COALESCE(m.sent_at, m.created_at) ASC
       LIMIT ${lim}`,
      [conversationId]
    );
    const messages = rows.map(mapMessage);
    if (!messages.length) return messages;
    const ids = messages.map((m) => m.id);
    const [atts] = await pool.execute(
      `SELECT * FROM communication_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byMsg = new Map();
    for (const a of atts || []) {
      if (!byMsg.has(a.message_id)) byMsg.set(a.message_id, []);
      byMsg.get(a.message_id).push(a);
    }
    return messages.map((m) => ({ ...m, attachments: byMsg.get(m.id) || [] }));
  }

  static async addMessage(data) {
    const [result] = await pool.execute(
      `INSERT INTO communication_messages
       (conversation_id, channel, direction, author_user_id, from_json, to_json, cc_json, bcc_json,
        subject, body_text, body_html, internet_message_id, in_reply_to, references_header,
        is_internal_note, support_ticket_message_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.conversationId,
        data.channel || 'email',
        data.direction || 'inbound',
        data.authorUserId ?? null,
        data.from ? JSON.stringify(data.from) : null,
        data.to ? JSON.stringify(data.to) : null,
        data.cc ? JSON.stringify(data.cc) : null,
        data.bcc ? JSON.stringify(data.bcc) : null,
        data.subject ?? null,
        data.bodyText ?? null,
        data.bodyHtml ?? null,
        data.internetMessageId ?? null,
        data.inReplyTo ?? null,
        data.referencesHeader ?? null,
        data.isInternalNote ? 1 : 0,
        data.supportTicketMessageId ?? null,
        data.sentAt ?? new Date()
      ]
    );
    const preview = String(data.bodyText || data.bodyHtml || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    await pool.execute(
      `UPDATE communication_conversations
       SET last_message_at = COALESCE(?, NOW()),
           last_message_preview = ?,
           draft_body = NULL,
           draft_updated_at = NULL
       WHERE id = ?`,
      [data.sentAt || new Date(), preview || null, data.conversationId]
    );
    return result.insertId;
  }

  static async addAttachment(messageId, att) {
    const [result] = await pool.execute(
      `INSERT INTO communication_attachments
       (message_id, filename, content_type, size_bytes, storage_key, storage_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        att.filename,
        att.contentType ?? null,
        att.sizeBytes ?? null,
        att.storageKey ?? null,
        att.storageUrl ?? null
      ]
    );
    return result.insertId;
  }
}

export default CommunicationConversation;
