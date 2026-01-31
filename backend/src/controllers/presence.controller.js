import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';

const IDLE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const OFFLINE_AFTER_MS = 2 * 60 * 1000; // 2 minutes since last heartbeat (best-effort)

function defaultAvailabilityForRole(role) {
  // Per requirements:
  // - admin/super_admin must explicitly "Go Online"
  // - everyone else is online by default and can toggle offline
  if (role === 'admin' || role === 'super_admin') return 'offline';
  return 'everyone';
}

function normalizeAvailability(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'offline' || v === 'admins_only' || v === 'everyone') return v;
  return null;
}

function canViewAdminsOnly(viewerRole) {
  return viewerRole === 'admin' || viewerRole === 'super_admin';
}

function computePresenceStatus(row, viewerRole) {
  const now = Date.now();
  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null;
  const act = row?.last_activity_at ? new Date(row.last_activity_at).getTime() : null;

  let status = 'offline';
  if (hb && now - hb <= OFFLINE_AFTER_MS) {
    if (act && now - act >= IDLE_AFTER_MS) status = 'idle';
    else status = 'online';
  }

  const availabilityLevel = normalizeAvailability(row?.availability_level) || defaultAvailabilityForRole(row?.role || viewerRole);

  // Apply availability filter to the computed status.
  if (availabilityLevel === 'offline') status = 'offline';
  if (availabilityLevel === 'admins_only' && !canViewAdminsOnly(viewerRole)) status = 'offline';

  return { status, availability_level: availabilityLevel };
}

async function assertAgencyAccess(reqUser, agencyId) {
  if (reqUser.role === 'super_admin') return true;
  const aId = agencyId ? parseInt(agencyId, 10) : null;
  if (!aId) return true;

  // Direct membership check
  const [direct] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [reqUser.id, aId]
  );
  let ok = !!(direct && direct.length > 0);

  // Affiliation membership check (child org -> parent agency)
  if (!ok) {
    try {
      const [aff] = await pool.execute(
        `SELECT 1
         FROM user_agencies ua
         INNER JOIN organization_affiliations oa
           ON oa.organization_id = ua.agency_id
          AND oa.agency_id = ?
          AND oa.is_active = TRUE
         WHERE ua.user_id = ?
         LIMIT 1`,
        [aId, reqUser.id]
      );
      ok = !!(aff && aff.length > 0);
    } catch (e) {
      // Backward compatible: if the table doesn't exist, just rely on direct membership.
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }

  if (!ok) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

export const heartbeat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rawAgencyId = req.body?.agencyId ?? req.body?.agency_id ?? null;
    const agencyId = rawAgencyId ? parseInt(rawAgencyId, 10) : null;
    const lastActivityAt = req.body?.lastActivityAt ? new Date(req.body.lastActivityAt) : null;

    if (agencyId) {
      await assertAgencyAccess(req.user, agencyId);
    }

    const defaultAvail = defaultAvailabilityForRole(req.user.role);
    await pool.execute(
      `INSERT INTO user_presence (user_id, agency_id, last_heartbeat_at, last_activity_at, availability_level)
       VALUES (?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         agency_id = VALUES(agency_id),
         last_heartbeat_at = NOW(),
         last_activity_at = COALESCE(VALUES(last_activity_at), last_activity_at),
         availability_level = COALESCE(availability_level, VALUES(availability_level))`,
      [
        userId,
        agencyId,
        lastActivityAt ? lastActivityAt.toISOString().slice(0, 19).replace('T', ' ') : null,
        defaultAvail
      ]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const markOffline = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Before clearing presence, convert any unread/un-notified chat messages into notifications.
    // This supports: "if they log out before they review it, it goes to notifications."
    try {
      const [unread] = await pool.execute(
        `SELECT t.id AS thread_id,
                t.agency_id,
                MAX(m.id) AS latest_message_id,
                SUBSTRING(MAX(CONCAT(LPAD(m.id, 10, '0'), m.body)), 11) AS latest_body,
                MAX(m.sender_user_id) AS latest_sender_user_id
         FROM chat_threads t
         JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
         JOIN chat_messages m ON m.thread_id = t.id AND m.sender_user_id <> ?
         LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
         WHERE (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)
           AND (r.last_notified_message_id IS NULL OR m.id > r.last_notified_message_id)
         GROUP BY t.id, t.agency_id`,
        [userId, userId, userId]
      );

      for (const row of unread || []) {
        const sender = await User.findById(row.latest_sender_user_id);
        const senderName = `${sender?.first_name || ''} ${sender?.last_name || ''}`.trim() || 'Someone';
        const snippetRaw = row.latest_body || '';
        const snippet = snippetRaw.length > 120 ? snippetRaw.slice(0, 117) + '…' : snippetRaw;

        await pool.execute(
          `INSERT INTO chat_thread_reads (thread_id, user_id, last_notified_message_id, last_notified_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE last_notified_message_id = VALUES(last_notified_message_id), last_notified_at = NOW()`,
          [row.thread_id, userId, row.latest_message_id]
        );

        await Notification.create({
          type: 'chat_message',
          severity: 'info',
          title: 'New chat message',
          message: `${senderName}: ${snippet}`,
          userId,
          agencyId: row.agency_id,
          relatedEntityType: 'chat_thread',
          relatedEntityId: row.thread_id
        });
      }
    } catch {
      // best-effort; do not block logout
    }

    await pool.execute(
      `UPDATE user_presence
       SET last_heartbeat_at = NULL,
           last_activity_at = NULL,
           availability_level = NULL, -- reset to role default on next login/session
           updated_at = NOW()
       WHERE user_id = ?`,
      [userId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getMyPresence = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [[row]] = await pool.execute(
      `SELECT user_id, last_heartbeat_at, last_activity_at, availability_level
       FROM user_presence
       WHERE user_id = ?`,
      [userId]
    );

    const computed = computePresenceStatus({ ...(row || {}), role: req.user.role }, req.user.role);

    res.json({
      user_id: userId,
      availability_level: computed.availability_level,
      heartbeat_status: computed.status
    });
  } catch (e) {
    next(e);
  }
};

export const setAvailability = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requested = normalizeAvailability(req.body?.availabilityLevel ?? req.body?.availability_level);
    if (!requested) {
      return res
        .status(400)
        .json({ error: { message: 'availabilityLevel must be one of: offline, admins_only, everyone' } });
    }

    // Permission rules:
    // - admin/super_admin can use all modes
    // - others can only toggle offline/everyone
    if (!(req.user.role === 'admin' || req.user.role === 'super_admin')) {
      if (requested === 'admins_only') {
        return res.status(403).json({ error: { message: 'admins_only availability is restricted to admin users' } });
      }
    }

    await pool.execute(
      `INSERT INTO user_presence (user_id, availability_level, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE availability_level = VALUES(availability_level), updated_at = NOW()`,
      [userId, requested]
    );

    res.json({ ok: true, availability_level: requested });
  } catch (e) {
    next(e);
  }
};

export const listAgencyPresence = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    await assertAgencyAccess(req.user, agencyId);

    // Users in the agency + their presence (if any).
    // IMPORTANT: presence is global per-user; if a user belongs to multiple agencies,
    // they should appear online for each agency when their heartbeat is fresh.
    const [agencyUsers] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN user_presence up ON up.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [agencyId]
    );

    // Allow admins to see superadmins who have opted into being reachable.
    let superAdmins = [];
    if (canViewAdminsOnly(req.user.role)) {
      const [sa] = await pool.execute(
        `SELECT u.id,
                u.first_name,
                u.last_name,
                u.email,
                u.role,
                up.last_heartbeat_at,
                up.last_activity_at,
                up.availability_level
         FROM users u
         LEFT JOIN user_presence up ON up.user_id = u.id
         WHERE u.role = 'super_admin'
           AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         ORDER BY u.first_name ASC, u.last_name ASC`
      );
      superAdmins = sa || [];
    }

    const dedup = new Map();
    for (const r of [...(agencyUsers || []), ...(superAdmins || [])]) {
      if (!dedup.has(r.id)) dedup.set(r.id, r);
    }
    const rows = Array.from(dedup.values());

    const withStatus = (rows || []).map((r) => {
      const computed = computePresenceStatus(r, req.user.role);
      return { ...r, status: computed.status, availability_level: computed.availability_level };
    });

    res.json(withStatus);
  } catch (e) {
    next(e);
  }
};

/**
 * Super-admin view: list admin/support presence across all agencies.
 * GET /api/presence/admins
 */
export const listAdminPresence = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level,
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agency_names
       FROM users u
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN agencies a ON a.id = ua.agency_id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND u.role IN ('admin', 'support')
       GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, up.last_heartbeat_at, up.last_activity_at, up.availability_level
       ORDER BY u.first_name ASC, u.last_name ASC`
    );

    const out = (rows || []).map((r) => {
      const computed = computePresenceStatus(r, req.user.role);
      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        role: r.role,
        agency_names: r.agency_names || '',
        status: computed.status,
        availability_level: computed.availability_level
      };
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
};

