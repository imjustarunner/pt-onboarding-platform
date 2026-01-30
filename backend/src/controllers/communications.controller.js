import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';

const canViewSms = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'support' || r === 'admin' || r === 'super_admin' || r === 'clinical_practice_assistant';
};

async function getAgencyIdsForUser(userId, role, forcedAgencyId) {
  const reqAgency = forcedAgencyId ? Number(forcedAgencyId) : null;
  if (reqAgency) {
    if (String(role || '').toLowerCase() === 'super_admin') return [reqAgency];
    const agencies = await User.getAgencies(userId);
    const ok = (agencies || []).some((a) => Number(a?.id) === reqAgency);
    if (!ok) {
      const err = new Error('Access denied to this agency');
      err.status = 403;
      throw err;
    }
    return [reqAgency];
  }
  if (String(role || '').toLowerCase() === 'super_admin') {
    const [a] = await pool.execute(
      `SELECT id
       FROM agencies
       WHERE (is_archived = FALSE OR is_archived IS NULL)`
    );
    return (a || []).map((r) => Number(r.id)).filter(Boolean);
  }
  const agencies = await User.getAgencies(userId);
  return (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
}

/**
 * Unified communications feed: SMS + platform chat (direct messages).
 * GET /api/communications/feed?limit=75&agencyId?=&organizationId?=
 */
export const getCommunicationsFeed = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : null;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 75;
    const agencyIdParam = req.query.agencyId ? parseInt(String(req.query.agencyId), 10) : null;
    const organizationId = req.query.organizationId ? parseInt(String(req.query.organizationId), 10) : null;

    const agencyIds = await getAgencyIdsForUser(userId, role, agencyIdParam);
    if (!agencyIds.length) return res.json([]);

    // Chat feed: threads user participates in (scoped optionally to org).
    const chatPlaceholders = agencyIds.map(() => '?').join(',');
    const chatWhereOrg = organizationId ? ' AND t.organization_id = ?' : '';
    const chatValues = organizationId
      ? [userId, userId, userId, userId, userId, ...agencyIds, organizationId]
      : [userId, userId, userId, userId, userId, ...agencyIds];
    const [chatRows] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              t.organization_id,
              org.slug AS organization_slug,
              org.name AS organization_name,
              t.updated_at,
              lm.id AS last_message_id,
              lm.body AS last_message_body,
              lm.created_at AS last_message_at,
              lm.sender_user_id AS last_message_sender_user_id,
              su.first_name AS last_sender_first_name,
              su.last_name AS last_sender_last_name,
              su.role AS last_sender_role,
              r.last_read_message_id,
              td.deleted_at AS thread_deleted_at,
              (
                SELECT COUNT(*)
                FROM chat_messages m2
                WHERE m2.thread_id = t.id
                  AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
                  AND m2.sender_user_id <> ?
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletes d2
                    WHERE d2.user_id = ? AND d2.message_id = m2.id
                  )
              ) AS unread_count
       FROM chat_threads t
       JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
       LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
       LEFT JOIN chat_thread_deletes td ON td.thread_id = t.id AND td.user_id = ?
       LEFT JOIN chat_messages lm ON lm.id = (
         SELECT m.id
         FROM chat_messages m
         LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
         WHERE m.thread_id = t.id AND d.message_id IS NULL
         ORDER BY m.id DESC
         LIMIT 1
       )
       LEFT JOIN users su ON su.id = lm.sender_user_id
       LEFT JOIN agencies org ON org.id = t.organization_id
       WHERE t.agency_id IN (${chatPlaceholders})${chatWhereOrg}
         AND (td.deleted_at IS NULL OR (lm.created_at IS NOT NULL AND lm.created_at > td.deleted_at))
       ORDER BY t.updated_at DESC
       LIMIT ${limit}`,
      chatValues
    );

    // Enrich chat rows with "other participant" for display.
    const threadIds = (chatRows || []).map((r) => Number(r.thread_id)).filter(Boolean);
    let participantsByThread = {};
    if (threadIds.length) {
      const p2 = threadIds.map(() => '?').join(',');
      const [parts] = await pool.execute(
        `SELECT tp.thread_id, u.id AS user_id, u.first_name, u.last_name, u.role
         FROM chat_thread_participants tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.thread_id IN (${p2})`,
        threadIds
      );
      participantsByThread = (parts || []).reduce((acc, p) => {
        acc[p.thread_id] = acc[p.thread_id] || [];
        acc[p.thread_id].push(p);
        return acc;
      }, {});
    }

    const chatItems = (chatRows || []).map((r) => {
      const participants = participantsByThread[r.thread_id] || [];
      const other = participants.find((p) => Number(p.user_id) !== Number(userId)) || null;
      const preview = r.last_message_body ? String(r.last_message_body) : '';
      return {
        kind: 'chat',
        thread_id: Number(r.thread_id),
        agency_id: Number(r.agency_id),
        organization_id: r.organization_id ? Number(r.organization_id) : null,
        organization_slug: r.organization_slug || null,
        organization_name: r.organization_name || null,
        other_participant: other
          ? {
              id: Number(other.user_id),
              first_name: other.first_name,
              last_name: other.last_name,
              role: other.role
            }
          : null,
        preview,
        last_message_at: r.last_message_at || r.updated_at,
        unread_count: Number(r.unread_count || 0),
        last_sender_role: r.last_sender_role || null
      };
    });

    // SMS feed: only for roles that can view SMS safety net.
    let smsItems = [];
    if (canViewSms(role) && !organizationId) {
      const placeholders = agencyIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT ml.*,
                c.initials AS client_initials,
                u.first_name AS user_first_name,
                u.last_name AS user_last_name
         FROM message_logs ml
         LEFT JOIN clients c ON ml.client_id = c.id
         LEFT JOIN users u ON ml.user_id = u.id
         WHERE ml.agency_id IN (${placeholders})
         ORDER BY ml.created_at DESC
         LIMIT ?`,
        [...agencyIds, limit]
      );
      smsItems = (rows || []).map((m) => ({
        kind: 'sms',
        id: Number(m.id),
        agency_id: Number(m.agency_id),
        user_id: m.user_id ? Number(m.user_id) : null,
        client_id: m.client_id ? Number(m.client_id) : null,
        direction: m.direction || null,
        preview: String(m.body || ''),
        created_at: m.created_at,
        client_initials: m.client_initials || null,
        user_first_name: m.user_first_name || null,
        user_last_name: m.user_last_name || null
      }));
    }

    // Merge + sort newest first.
    const merged = [...chatItems, ...smsItems].sort((a, b) => {
      const at = a.kind === 'chat' ? new Date(a.last_message_at || 0).getTime() : new Date(a.created_at || 0).getTime();
      const bt = b.kind === 'chat' ? new Date(b.last_message_at || 0).getTime() : new Date(b.created_at || 0).getTime();
      return bt - at;
    });

    res.json(merged.slice(0, limit));
  } catch (e) {
    next(e);
  }
};

