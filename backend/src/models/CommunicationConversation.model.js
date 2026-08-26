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
    is_internal_note: !!row.is_internal_note,
    send_status: row.send_status || 'sent',
    scheduled_send_at: row.scheduled_send_at || null,
    undo_expires_at: row.undo_expires_at || null
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

  static async findByExternalThreadId(agencyId, externalThreadId) {
    if (!externalThreadId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM communication_conversations
       WHERE agency_id = ? AND external_thread_id = ?
       LIMIT 1`,
      [agencyId, externalThreadId]
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
      externalThreadId: 'external_thread_id',
      isSpam: 'is_spam'
    };
    const fields = [];
    const values = [];
    for (const [k, col] of Object.entries(map)) {
      if (updates[k] !== undefined) {
        fields.push(`${col} = ?`);
        let v = updates[k];
        if (k === 'starred' || k === 'isSpam') v = v ? 1 : 0;
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
    fromEmail = null,
    hasAttachment = null,
    dateFrom = null,
    dateTo = null,
    limit = 50,
    offset = 0,
    userId = null
  } = {}) {
    const where = ['c.archived_at IS NULL', 'COALESCE(c.is_spam, 0) = 0'];
    const params = [];
    if (agencyId != null) {
      where.push('(c.agency_id = ? OR c.agency_id IS NULL)');
      params.push(agencyId);
    }
    if (inboxId) {
      // Email is inbox-scoped; SMS/calls are agency-wide (no mailbox) and still appear in All.
      if (!channel || channel === 'all') {
        where.push('(c.inbox_id = ? OR c.channel IN (\'sms\', \'call\', \'voicemail\'))');
        params.push(inboxId);
      } else if (['sms', 'call', 'voicemail'].includes(String(channel))) {
        // Channel filter alone; ignore inbox for telephony channels
      } else {
        where.push('c.inbox_id = ?');
        params.push(inboxId);
      }
    }
    if (channel && channel !== 'all') {
      if (channel === 'call') {
        where.push(`c.channel IN ('call', 'voicemail')`);
      } else {
        where.push('c.channel = ?');
        params.push(channel);
      }
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (ownerUserId) {
      where.push('c.owner_user_id = ?');
      params.push(ownerUserId);
    }

    const from = String(fromEmail || '').trim().toLowerCase();
    if (from) {
      where.push(`EXISTS (
        SELECT 1 FROM communication_participants p
        WHERE p.conversation_id = c.id AND LOWER(p.email) LIKE ?
      )`);
      params.push(`%${from.replace(/[%_]/g, '')}%`);
    }

    if (hasAttachment === true || hasAttachment === '1' || hasAttachment === 1) {
      where.push(`EXISTS (
        SELECT 1 FROM communication_messages m
        JOIN communication_attachments a ON a.message_id = m.id
        WHERE m.conversation_id = c.id
      )`);
    } else if (hasAttachment === false || hasAttachment === '0' || hasAttachment === 0) {
      where.push(`NOT EXISTS (
        SELECT 1 FROM communication_messages m
        JOIN communication_attachments a ON a.message_id = m.id
        WHERE m.conversation_id = c.id
      )`);
    }

    if (dateFrom) {
      where.push('COALESCE(c.last_message_at, c.created_at) >= ?');
      params.push(new Date(dateFrom));
    }
    if (dateTo) {
      where.push('COALESCE(c.last_message_at, c.created_at) <= ?');
      params.push(new Date(dateTo));
    }

    const query = String(q || '').trim();
    if (query) {
      // Supports keywords plus structured prefixes: from:, subject:, file:
      let keyword = query;
      const fromMatch = query.match(/\bfrom:(\S+)/i);
      const subjectMatch = query.match(/\bsubject:(\S+)/i);
      const fileMatch = query.match(/\bfile:(\S+)/i);
      if (fromMatch && !from) {
        where.push(`EXISTS (
          SELECT 1 FROM communication_participants p
          WHERE p.conversation_id = c.id AND LOWER(p.email) LIKE ?
        )`);
        params.push(`%${fromMatch[1].toLowerCase().replace(/[%_]/g, '')}%`);
        keyword = keyword.replace(fromMatch[0], ' ').trim();
      }
      if (subjectMatch) {
        where.push('c.subject LIKE ?');
        params.push(`%${subjectMatch[1].replace(/[%_]/g, '')}%`);
        keyword = keyword.replace(subjectMatch[0], ' ').trim();
      }
      if (fileMatch) {
        where.push(`EXISTS (
          SELECT 1 FROM communication_messages m
          JOIN communication_attachments a ON a.message_id = m.id
          WHERE m.conversation_id = c.id AND a.filename LIKE ?
        )`);
        params.push(`%${fileMatch[1].replace(/[%_]/g, '')}%`);
        keyword = keyword.replace(fileMatch[0], ' ').trim();
      }

      if (keyword) {
        const like = `%${keyword.replace(/[%_]/g, '')}%`;
        where.push(`(
          c.subject LIKE ?
          OR c.last_message_preview LIKE ?
          OR EXISTS (
            SELECT 1 FROM communication_participants p
            WHERE p.conversation_id = c.id
              AND (p.email LIKE ? OR p.display_name LIKE ?)
          )
          OR EXISTS (
            SELECT 1 FROM communication_messages m
            WHERE m.conversation_id = c.id
              AND (m.body_text LIKE ? OR m.subject LIKE ?)
              AND (m.send_status IS NULL OR m.send_status <> 'cancelled')
          )
          OR EXISTS (
            SELECT 1 FROM communication_messages m
            JOIN communication_attachments a ON a.message_id = m.id
            WHERE m.conversation_id = c.id AND a.filename LIKE ?
          )
        )`);
        params.push(like, like, like, like, like, like, like);
      }
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
      is_spam: !!r.is_spam,
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
         WHERE archived_at IS NULL AND COALESCE(is_spam, 0) = 0 AND ${agencyClause} AND ${extra}`,
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
       WHERE archived_at IS NULL AND COALESCE(is_spam, 0) = 0 AND ${agencyClause}
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

  static async removeLink(conversationId, entityType, entityId) {
    await pool.execute(
      `DELETE FROM communication_links
       WHERE conversation_id = ? AND entity_type = ? AND entity_id = ?`,
      [conversationId, entityType, entityId]
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
         AND (m.send_status IS NULL OR m.send_status <> 'cancelled')
       ORDER BY COALESCE(m.sent_at, m.scheduled_send_at, m.created_at) ASC
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
    const sendStatus = data.sendStatus || (data.scheduledSendAt ? 'scheduled' : 'sent');
    const [result] = await pool.execute(
      `INSERT INTO communication_messages
       (conversation_id, channel, direction, author_user_id, from_json, to_json, cc_json, bcc_json,
        subject, body_text, body_html, internet_message_id, in_reply_to, references_header,
        is_internal_note, send_status, scheduled_send_at, undo_expires_at, support_ticket_message_id, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sendStatus,
        data.scheduledSendAt ?? null,
        data.undoExpiresAt ?? null,
        data.supportTicketMessageId ?? null,
        data.sentAt ?? (sendStatus === 'scheduled' ? null : new Date())
      ]
    );
    const preview = String(data.bodyText || data.bodyHtml || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    if (sendStatus !== 'cancelled') {
      await pool.execute(
        `UPDATE communication_conversations
         SET last_message_at = COALESCE(?, last_message_at, NOW()),
             last_message_preview = COALESCE(?, last_message_preview),
             draft_body = NULL,
             draft_updated_at = NULL
         WHERE id = ?`,
        [
          sendStatus === 'scheduled' ? data.scheduledSendAt || new Date() : data.sentAt || new Date(),
          preview || null,
          data.conversationId
        ]
      );
    }
    return result.insertId;
  }

  static async findMessageById(messageId) {
    const [rows] = await pool.execute(
      `SELECT * FROM communication_messages WHERE id = ? LIMIT 1`,
      [messageId]
    );
    return mapMessage(rows[0] || null);
  }

  static async updateMessage(messageId, updates = {}) {
    const map = {
      sendStatus: 'send_status',
      scheduledSendAt: 'scheduled_send_at',
      undoExpiresAt: 'undo_expires_at',
      internetMessageId: 'internet_message_id',
      sentAt: 'sent_at',
      bodyText: 'body_text',
      bodyHtml: 'body_html'
    };
    const fields = [];
    const values = [];
    for (const [k, col] of Object.entries(map)) {
      if (updates[k] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(updates[k]);
      }
    }
    if (!fields.length) return this.findMessageById(messageId);
    values.push(messageId);
    await pool.execute(`UPDATE communication_messages SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findMessageById(messageId);
  }

  static async listDueScheduledMessages({ limit = 50 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const [rows] = await pool.execute(
      `SELECT m.*, c.agency_id, c.inbox_id, c.subject AS conversation_subject, c.external_thread_id
       FROM communication_messages m
       JOIN communication_conversations c ON c.id = m.conversation_id
       WHERE m.send_status = 'scheduled'
         AND m.scheduled_send_at IS NOT NULL
         AND m.scheduled_send_at <= NOW()
       ORDER BY m.scheduled_send_at ASC
       LIMIT ${lim}`
    );
    return rows || [];
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
