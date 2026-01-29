import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';

const ONLINE_ACTIVITY_MS = 5 * 60 * 1000;
const ONLINE_HEARTBEAT_MS = 2 * 60 * 1000;

async function assertAgencyOrOrgAccess(reqUser, agencyId, organizationId = null) {
  if (reqUser.role === 'super_admin') return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
  const okAgency = ids.includes(Number(agencyId));
  const okOrg = organizationId ? ids.includes(Number(organizationId)) : false;
  if (!okAgency && !okOrg) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function assertThreadAccess(reqUserId, threadId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
    [threadId, reqUserId]
  );
  const ok = rows.length > 0;
  if (!ok) {
    const err = new Error('Access denied to this chat thread');
    err.status = 403;
    throw err;
  }
  return true;
}

async function findOrCreateDirectThread(agencyId, organizationId, userAId, userBId) {
  // Find a direct thread in this agency that has exactly these 2 participants.
  const [rows] = await pool.execute(
    `SELECT tp.thread_id
     FROM chat_threads t
     JOIN chat_thread_participants tp ON tp.thread_id = t.id
     WHERE t.agency_id = ?
       AND (t.organization_id <=> ?)
       AND t.thread_type = 'direct'
       AND tp.user_id IN (?, ?)
     GROUP BY tp.thread_id
     HAVING COUNT(DISTINCT tp.user_id) = 2
     LIMIT 1`,
    [agencyId, organizationId || null, userAId, userBId]
  );
  if (rows.length) return rows[0].thread_id;

  const [ins] = await pool.execute(
    'INSERT INTO chat_threads (agency_id, organization_id, thread_type) VALUES (?, ?, ?)',
    [agencyId, organizationId || null, 'direct']
  );
  const threadId = ins.insertId;
  await pool.execute(
    'INSERT INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?), (?, ?)',
    [threadId, userAId, threadId, userBId]
  );
  return threadId;
}

async function resolveActiveAgencyIdForOrg(orgId) {
  // Prefer organization_affiliations; fall back to legacy agency_schools.
  const [rows] = await pool.execute(
    `SELECT agency_id
     FROM organization_affiliations
     WHERE organization_id = ? AND is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [orgId]
  );
  if (rows?.[0]?.agency_id) return Number(rows[0].agency_id);
  try {
    const [legacy] = await pool.execute(
      `SELECT agency_id
       FROM agency_schools
       WHERE school_organization_id = ? AND (is_active = TRUE OR is_active IS NULL)
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [orgId]
    );
    return legacy?.[0]?.agency_id ? Number(legacy[0].agency_id) : null;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return null;
    throw e;
  }
}

async function isUserAwayForAgency(userId, agencyId) {
  const [rows] = await pool.execute(
    'SELECT last_heartbeat_at, last_activity_at, availability_level FROM user_presence WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) return true;
  const availability = String(rows[0].availability_level || '').toLowerCase();
  if (availability === 'offline') return true;
  const hb = rows[0].last_heartbeat_at ? new Date(rows[0].last_heartbeat_at).getTime() : null;
  const act = rows[0].last_activity_at ? new Date(rows[0].last_activity_at).getTime() : null;
  const now = Date.now();

  // Treat as away if no fresh heartbeat or idle (>=5 min).
  if (!hb || now - hb > ONLINE_HEARTBEAT_MS) return true;
  if (act && now - act >= ONLINE_ACTIVITY_MS) return true;
  return false;
}

export const listMyThreads = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;

    let agencyIds = [];
    if (agencyId) {
      await assertAgencyOrOrgAccess(req.user, agencyId);
      agencyIds = [agencyId];
    } else {
      if (req.user.role === 'super_admin') {
        const [a] = await pool.execute(
          `SELECT id
           FROM agencies
           WHERE (is_archived = FALSE OR is_archived IS NULL)`
        );
        agencyIds = (a || []).map((r) => r.id);
      } else {
        const agencies = await User.getAgencies(req.user.id);
        agencyIds = (agencies || []).map((a) => a.id);
      }
    }

    const userId = req.user.id;
    if (!agencyIds.length) return res.json([]);
    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              t.organization_id,
              t.updated_at,
              lm.id AS last_message_id,
              lm.body AS last_message_body,
              lm.created_at AS last_message_at,
              lm.sender_user_id AS last_message_sender_user_id,
              r.last_read_message_id,
              (
                SELECT COUNT(*)
                FROM chat_messages m2
                WHERE m2.thread_id = t.id
                  AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
                  AND m2.sender_user_id <> ?
              ) AS unread_count
       FROM chat_threads t
       JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
       LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
       LEFT JOIN chat_messages lm ON lm.id = (
         SELECT m.id FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1
       )
       WHERE t.agency_id IN (${placeholders})
       ORDER BY t.updated_at DESC`,
      [userId, userId, userId, ...agencyIds]
    );

    // Enrich with "other participant" for direct threads
    const threadIds = (rows || []).map((r) => r.thread_id);
    let participantsByThread = {};
    if (threadIds.length) {
      const placeholders2 = threadIds.map(() => '?').join(',');
      const [parts] = await pool.execute(
        `SELECT tp.thread_id, u.id AS user_id, u.first_name, u.last_name, u.email, u.role
         FROM chat_thread_participants tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.thread_id IN (${placeholders2})`,
        threadIds
      );
      participantsByThread = (parts || []).reduce((acc, p) => {
        acc[p.thread_id] = acc[p.thread_id] || [];
        acc[p.thread_id].push(p);
        return acc;
      }, {});
    }

    const threads = (rows || []).map((r) => {
      const participants = participantsByThread[r.thread_id] || [];
      const other = participants.find((p) => p.user_id !== userId) || null;
      return {
        thread_id: r.thread_id,
        agency_id: r.agency_id,
        organization_id: r.organization_id || null,
        updated_at: r.updated_at,
        unread_count: Number(r.unread_count || 0),
        last_message: r.last_message_id
          ? {
              id: r.last_message_id,
              body: r.last_message_body,
              created_at: r.last_message_at,
              sender_user_id: r.last_message_sender_user_id
            }
          : null,
        other_participant: other
          ? {
              id: other.user_id,
              first_name: other.first_name,
              last_name: other.last_name,
              email: other.email,
              role: other.role
            }
          : null
      };
    });

    res.json(threads);
  } catch (e) {
    next(e);
  }
};

export const createOrGetDirectThread = async (req, res, next) => {
  try {
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const otherUserId = req.body.otherUserId ? parseInt(req.body.otherUserId, 10) : null;
    const organizationId = req.body.organizationId ? parseInt(req.body.organizationId, 10) : null;
    if (!agencyId || !otherUserId) {
      return res.status(400).json({ error: { message: 'agencyId and otherUserId are required' } });
    }
    // Allow org-scoped chat creation for school portal users who have org access
    // (even if they are not directly in the agency), but require the org to be affiliated to the agency.
    if (organizationId) {
      const active = await resolveActiveAgencyIdForOrg(organizationId);
      if (active && Number(active) !== Number(agencyId)) {
        return res.status(400).json({ error: { message: 'organizationId is not affiliated to this agency' } });
      }
    }
    await assertAgencyOrOrgAccess(req.user, agencyId, organizationId);

    const me = req.user.id;
    if (me === otherUserId) {
      return res.status(400).json({ error: { message: 'Cannot create a chat with yourself' } });
    }

    // Ensure the other user is in the agency (unless super_admin, still enforce membership)
    const [inAgency] = await pool.execute(
      'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [otherUserId, agencyId]
    );
    if (inAgency.length === 0) {
      return res.status(400).json({ error: { message: 'User is not in the selected agency' } });
    }

    const threadId = await findOrCreateDirectThread(agencyId, organizationId, me, otherUserId);
    res.status(201).json({ threadId });
  } catch (e) {
    next(e);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    // Read receipts (direct threads): determine what the other participant has read.
    // For now, we support "read by other" by using the max last_read_message_id among all other participants.
    let otherLastReadMessageId = null;
    try {
      const [parts] = await pool.execute(
        'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id <> ?',
        [threadId, req.user.id]
      );
      const otherIds = (parts || []).map((p) => Number(p.user_id)).filter(Boolean);
      if (otherIds.length) {
        const placeholders = otherIds.map(() => '?').join(',');
        const [reads] = await pool.execute(
          `SELECT last_read_message_id
           FROM chat_thread_reads
           WHERE thread_id = ? AND user_id IN (${placeholders})`,
          [threadId, ...otherIds]
        );
        for (const r of reads || []) {
          const v = r?.last_read_message_id ? Number(r.last_read_message_id) : null;
          if (!v) continue;
          if (!otherLastReadMessageId || v > otherLastReadMessageId) otherLastReadMessageId = v;
        }
      }
    } catch {
      // Best-effort; do not fail message loading if receipts can't be computed.
      otherLastReadMessageId = null;
    }

    // NOTE: Some MySQL/CloudSQL setups reject prepared-statement params for LIMIT,
    // yielding "Incorrect arguments to mysqld_stmt_execute". We inline a validated integer.
    const parsed = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 60;
    const [rows] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.thread_id = ?
       ORDER BY m.id DESC
       LIMIT ${limit}`,
      [threadId]
    );
    const ordered = (rows || []).reverse();
    const me = Number(req.user.id);
    const enriched = ordered.map((m) => {
      const id = m?.id ? Number(m.id) : null;
      const isMine = Number(m?.sender_user_id) === me;
      const isReadByOther = !!(isMine && id && otherLastReadMessageId && id <= otherLastReadMessageId);
      return { ...m, is_read_by_other: isReadByOther };
    });
    res.json(enriched);
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const body = (req.body?.body || '').trim();
    if (!threadId || !body) return res.status(400).json({ error: { message: 'body is required' } });
    await assertThreadAccess(req.user.id, threadId);

    // Resolve agency + participants
    const [[t]] = await pool.execute('SELECT id, agency_id, organization_id FROM chat_threads WHERE id = ?', [threadId]);
    if (!t) return res.status(404).json({ error: { message: 'Thread not found' } });
    const agencyId = t.agency_id;
    await assertAgencyOrOrgAccess(req.user, agencyId, t.organization_id || null);

    const [ins] = await pool.execute(
      'INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)',
      [threadId, req.user.id, body]
    );
    await pool.execute('UPDATE chat_threads SET updated_at = NOW() WHERE id = ?', [threadId]);

    // Notifications: notify other participant if they are away/offline
    const [parts] = await pool.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id = ?', [threadId]);
    const recipients = (parts || []).map((p) => p.user_id).filter((id) => id !== req.user.id);

    const senderUser = await User.findById(req.user.id);
    const senderName = `${senderUser?.first_name || ''} ${senderUser?.last_name || ''}`.trim() || 'Someone';
    const snippet = body.length > 120 ? body.slice(0, 117) + '…' : body;

    for (const rid of recipients) {
      // Avoid spamming: only notify if this message is newer than last_notified_message_id
      const messageId = ins.insertId;
      const [[readState]] = await pool.execute(
        'SELECT last_notified_message_id FROM chat_thread_reads WHERE thread_id = ? AND user_id = ?',
        [threadId, rid]
      );
      if (readState?.last_notified_message_id && messageId <= readState.last_notified_message_id) {
        continue;
      }

      await pool.execute(
        `INSERT INTO chat_thread_reads (thread_id, user_id, last_notified_message_id, last_notified_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_notified_message_id = VALUES(last_notified_message_id), last_notified_at = NOW()`,
        [threadId, rid, messageId]
      );

      await Notification.create({
        type: 'chat_message',
        severity: 'info',
        title: 'New chat message',
        message: `${senderName}: ${snippet}`,
        userId: rid,
        agencyId,
        relatedEntityType: 'chat_thread',
        relatedEntityId: threadId
      });
    }

    const [row] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.id = ?`,
      [ins.insertId]
    );
    res.status(201).json(row[0]);
  } catch (e) {
    next(e);
  }
};

export const unsendMessage = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!threadId || !messageId) {
      return res.status(400).json({ error: { message: 'threadId and messageId are required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    const [[msg]] = await pool.execute(
      'SELECT id, thread_id, sender_user_id, body, created_at FROM chat_messages WHERE id = ? AND thread_id = ? LIMIT 1',
      [messageId, threadId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    if (Number(msg.sender_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Only allow unsend if the recipient has not read this message.
    let otherLastReadMessageId = null;
    const [parts] = await pool.execute(
      'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id <> ?',
      [threadId, req.user.id]
    );
    const recipientIds = (parts || []).map((p) => Number(p.user_id)).filter(Boolean);
    if (recipientIds.length) {
      const placeholders = recipientIds.map(() => '?').join(',');
      const [reads] = await pool.execute(
        `SELECT last_read_message_id
         FROM chat_thread_reads
         WHERE thread_id = ? AND user_id IN (${placeholders})`,
        [threadId, ...recipientIds]
      );
      for (const r of reads || []) {
        const v = r?.last_read_message_id ? Number(r.last_read_message_id) : null;
        if (!v) continue;
        if (!otherLastReadMessageId || v > otherLastReadMessageId) otherLastReadMessageId = v;
      }
    }
    if (otherLastReadMessageId && Number(messageId) <= Number(otherLastReadMessageId)) {
      return res.status(409).json({ error: { message: 'Cannot unsend: message was already read' } });
    }

    await pool.execute('DELETE FROM chat_messages WHERE id = ? AND thread_id = ?', [messageId, threadId]);
    await pool.execute('UPDATE chat_threads SET updated_at = NOW() WHERE id = ?', [threadId]);

    // Best-effort: delete the notification that contains this message snippet (if it was created).
    try {
      const senderUser = await User.findById(req.user.id);
      const senderName = `${senderUser?.first_name || ''} ${senderUser?.last_name || ''}`.trim() || 'Someone';
      const b = String(msg.body || '');
      const snippet = b.length > 120 ? b.slice(0, 117) + '…' : b;
      const notificationMessage = `${senderName}: ${snippet}`;
      for (const rid of recipientIds) {
        // Delete the most specific match (thread + recipient + exact message text).
        await pool.execute(
          `DELETE FROM notifications
           WHERE user_id = ?
             AND type = 'chat_message'
             AND related_entity_type = 'chat_thread'
             AND related_entity_id = ?
             AND message = ?`,
          [rid, threadId, notificationMessage]
        );
      }
    } catch {
      // ignore
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const lastReadMessageId = req.body?.lastReadMessageId ? parseInt(req.body.lastReadMessageId, 10) : null;
    if (!threadId || !lastReadMessageId) {
      return res.status(400).json({ error: { message: 'lastReadMessageId is required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    await pool.execute(
      `INSERT INTO chat_thread_reads (thread_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), last_read_at = NOW()`,
      [threadId, req.user.id, lastReadMessageId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getThreadMeta = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    const [[t]] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              t.organization_id,
              org.slug AS organization_slug,
              org.name AS organization_name
       FROM chat_threads t
       LEFT JOIN agencies org ON org.id = t.organization_id
       WHERE t.id = ?
       LIMIT 1`,
      [threadId]
    );
    if (!t) return res.status(404).json({ error: { message: 'Thread not found' } });
    await assertAgencyOrOrgAccess(req.user, t.agency_id, t.organization_id || null);

    res.json({
      thread_id: t.thread_id,
      agency_id: t.agency_id,
      organization_id: t.organization_id || null,
      organization_slug: t.organization_slug || null,
      organization_name: t.organization_name || null
    });
  } catch (e) {
    next(e);
  }
};

