import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import UserPresenceStatus from '../models/UserPresenceStatus.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  TEAM_EMPLOYEE_ROLES,
  canToggleDirectoryAudience,
  isSchoolStaffRole,
  normalizeAudience,
  normalizeRoleFilter
} from '../utils/presenceAudience.js';

const IDLE_AFTER_MS = 5 * 60 * 1000; // 5 minutes since last_activity_at → idle
/** Max heartbeat interval is 300s; allow buffer so slow/idle cadence does not false-offline. */
const OFFLINE_AFTER_MS = 6 * 60 * 1000; // 6 minutes since last_heartbeat_at

function defaultAvailabilityForRole(role) {
  // Privileged roles appear online when heartbeat is fresh (Slack-like).
  // They still can explicitly set offline via availability / status menu.
  if (UserPresenceStatus.isPrivilegedRole(role)) return 'everyone';
  return 'everyone';
}

function normalizeAvailability(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'offline' || v === 'admins_only' || v === 'everyone') return v;
  return null;
}

function canViewAdminsOnly(viewerRole) {
  return viewerRole === 'admin' || viewerRole === 'super_admin' || viewerRole === 'support';
}

function richStatusFields(row) {
  return {
    presence_status: row?.presence_status || row?.rich_status || null,
    presence_reason: row?.presence_reason || row?.reason || null,
    presence_display_label: row?.presence_display_label || row?.display_label || null,
    presence_note: row?.presence_note || row?.note || null,
    presence_expected_return_at: row?.presence_expected_return_at || row?.expected_return_at || null,
    presence_session_extend_until: row?.presence_session_extend_until || row?.session_extend_until || null
  };
}

function hasActiveAwayStatus(row) {
  const rich = richStatusFields(row);
  const status = rich.presence_status;
  const reason = rich.presence_reason;
  const now = Date.now();
  const extendUntil = rich.presence_session_extend_until
    ? new Date(rich.presence_session_extend_until).getTime()
    : null;
  const returnAt = rich.presence_expected_return_at
    ? new Date(rich.presence_expected_return_at).getTime()
    : null;
  const endsAt = row?.presence_ends_at ? new Date(row.presence_ends_at).getTime() : null;

  // Active session extension always counts as Away (includes reachable call/text reasons)
  if (extendUntil && extendUntil > now) return true;

  if (!status) return false;
  const awayLike =
    UserPresenceStatus.isAwayStatus(status) ||
    (reason && UserPresenceStatus.isValidReason(reason) && reason !== 'custom' && status !== 'in_available');
  if (!awayLike) return false;

  if (returnAt && returnAt > now) return true;
  if (endsAt && endsAt > now) return true;
  if (status === 'out_full_day' || status === 'out_am' || status === 'out_pm' || status === 'traveling_offsite' || reason === 'out_day') {
    if (!endsAt) return true;
  }
  if (status === 'out_quick' || reason) {
    const started = row?.presence_started_at ? new Date(row.presence_started_at).getTime() : null;
    if (started && now - started < UserPresenceStatus.MAX_SESSION_EXTEND_MS) return true;
  }
  return false;
}

function computePresenceStatus(row, viewerRole) {
  const now = Date.now();
  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null;
  const act = row?.last_activity_at ? new Date(row.last_activity_at).getTime() : null;
  const rich = richStatusFields(row);
  const away = hasActiveAwayStatus(row);

  let status = 'offline';
  // Active session extension keeps Away visible even if tab is hidden briefly
  if (away && rich.presence_session_extend_until) {
    const ext = new Date(rich.presence_session_extend_until).getTime();
    if (ext > now) status = 'idle';
  }
  if (status === 'offline' && hb && now - hb <= OFFLINE_AFTER_MS) {
    if (away || (act && now - act >= IDLE_AFTER_MS)) status = 'idle';
    else status = 'online';
  }

  const availabilityLevel =
    normalizeAvailability(row?.availability_level) || defaultAvailabilityForRole(row?.role || viewerRole);

  // Apply availability filter (rich away still shows as idle to privileged viewers when admins_only).
  if (availabilityLevel === 'offline' && !away) status = 'offline';
  if (availabilityLevel === 'offline' && away) status = 'idle';
  if (availabilityLevel === 'admins_only' && !canViewAdminsOnly(viewerRole)) status = 'offline';

  return {
    status,
    availability_level: availabilityLevel,
    ...rich,
    status_label:
      rich.presence_display_label ||
      UserPresenceStatus.labelForReason(rich.presence_reason) ||
      (status === 'online' ? 'Active' : status === 'idle' ? 'Away' : 'Offline')
  };
}

const PRESENCE_STATUS_JOIN = `
  ps.status AS presence_status,
  ps.note AS presence_note,
  ps.started_at AS presence_started_at,
  ps.ends_at AS presence_ends_at,
  ps.expected_return_at AS presence_expected_return_at,
  ps.reason AS presence_reason,
  ps.display_label AS presence_display_label,
  ps.session_extend_until AS presence_session_extend_until
`;

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
          relatedEntityId: row.thread_id,
          actorUserId: row.latest_sender_user_id
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
    // End session-extension window; keep Team Board day-level status if set
    try {
      await pool.execute(
        `UPDATE user_presence_status
         SET session_extend_until = NULL
         WHERE user_id = ?`,
        [userId]
      );
    } catch {
      /* columns may not exist yet on older DBs */
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getMyPresence = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [[row]] = await pool.execute(
      `SELECT up.user_id, up.last_heartbeat_at, up.last_activity_at, up.availability_level,
              ${PRESENCE_STATUS_JOIN}
       FROM user_presence up
       LEFT JOIN user_presence_status ps ON ps.user_id = up.user_id
       WHERE up.user_id = ?`,
      [userId]
    );
    let merged = row;
    if (!merged) {
      const rich = await UserPresenceStatus.findByUserId(userId);
      merged = rich
        ? {
            presence_status: rich.status,
            presence_note: rich.note,
            presence_started_at: rich.started_at,
            presence_ends_at: rich.ends_at,
            presence_expected_return_at: rich.expected_return_at,
            presence_reason: rich.reason,
            presence_display_label: rich.display_label,
            presence_session_extend_until: rich.session_extend_until
          }
        : {};
    }

    const computed = computePresenceStatus({ ...(merged || {}), role: req.user.role }, req.user.role);

    let sessionExtendUntil = computed.presence_session_extend_until || null;
    let sessionExtendActive = !!(
      sessionExtendUntil && new Date(sessionExtendUntil).getTime() > Date.now()
    );
    // Drop expired extend timestamps so clients do not keep pausing Timedown from stale rows.
    if (sessionExtendUntil && !sessionExtendActive) {
      try {
        await pool.execute(
          `UPDATE user_presence_status SET session_extend_until = NULL WHERE user_id = ?`,
          [userId]
        );
      } catch {
        /* column may not exist yet */
      }
      sessionExtendUntil = null;
    }

    res.json({
      user_id: userId,
      availability_level: computed.availability_level,
      heartbeat_status: computed.status,
      status: computed.status,
      status_label: computed.status_label,
      presence_status: computed.presence_status,
      presence_reason: computed.presence_reason,
      presence_display_label: computed.presence_display_label,
      presence_note: computed.presence_note,
      presence_expected_return_at: computed.presence_expected_return_at,
      presence_session_extend_until: sessionExtendUntil,
      session_extend_active: sessionExtendActive
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
    // - admin/super_admin/support can use all modes
    // - others can only toggle offline/everyone
    if (!UserPresenceStatus.isPrivilegedRole(req.user.role)) {
      if (requested === 'admins_only') {
        return res.status(403).json({
          error: { message: 'admins_only availability is restricted to admin/support users' }
        });
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

async function attachSchoolNames(rows) {
  const list = rows || [];
  if (!list.length) return list;
  const ids = list.map((r) => r.id).filter(Boolean);
  if (!ids.length) return list;
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [schoolRows] = await pool.execute(
      `SELECT ua.user_id,
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS school_names
       FROM user_agencies ua
       INNER JOIN agencies a ON a.id = ua.agency_id
         AND LOWER(COALESCE(a.organization_type, '')) = 'school'
       WHERE ua.user_id IN (${placeholders})
       GROUP BY ua.user_id`,
      ids
    );
    const map = new Map((schoolRows || []).map((r) => [r.user_id, r.school_names || '']));
    return list.map((r) => ({
      ...r,
      school_names: map.get(r.id) || r.school_names || '',
      // Always surface school label for school_staff (and when present for others)
      org_label:
        String(r.role || '').toLowerCase() === 'school_staff'
          ? map.get(r.id) || r.school_names || 'School staff'
          : map.get(r.id) || r.agency_names || null
    }));
  } catch {
    return list.map((r) => ({
      ...r,
      school_names: r.school_names || '',
      org_label: String(r.role || '').toLowerCase() === 'school_staff' ? r.school_names || 'School staff' : null
    }));
  }
}

function mapChatPresenceRows(rows, viewerRole) {
  return (rows || []).map((r) => {
    const computed = computePresenceStatus(r, viewerRole);
    return {
      ...r,
      status: computed.status,
      availability_level: computed.availability_level,
      status_label: computed.status_label,
      presence_status: computed.presence_status,
      presence_reason: computed.presence_reason,
      presence_display_label: computed.presence_display_label,
      presence_note: computed.presence_note,
      presence_expected_return_at: computed.presence_expected_return_at,
      presence_session_extend_until: computed.presence_session_extend_until
    };
  });
}

/**
 * School-scoped DM directory: peers who share the viewer's school org memberships
 * (and providers assigned to those schools).
 */
async function listSchoolScopedPresence(viewerUserId) {
  const [schoolIdsRows] = await pool.execute(
    `SELECT ua.agency_id AS school_id
     FROM user_agencies ua
     INNER JOIN agencies a ON a.id = ua.agency_id
       AND LOWER(COALESCE(a.organization_type, '')) = 'school'
     WHERE ua.user_id = ?`,
    [viewerUserId]
  );
  const schoolIds = (schoolIdsRows || []).map((r) => parseInt(r.school_id, 10)).filter((n) => n > 0);
  if (!schoolIds.length) return [];

  const placeholders = schoolIds.map(() => '?').join(',');
  const [peers] = await pool.execute(
    `SELECT DISTINCT u.id,
            u.first_name,
            u.last_name,
            u.email,
            u.role,
            up.last_heartbeat_at,
            up.last_activity_at,
            up.availability_level,
            ${PRESENCE_STATUS_JOIN}
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
     LEFT JOIN user_presence up ON up.user_id = u.id
     LEFT JOIN user_presence_status ps ON ps.user_id = u.id
     WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND u.role NOT IN ('client_guardian', 'kiosk')
     ORDER BY u.first_name ASC, u.last_name ASC`,
    schoolIds
  );

  // Providers assigned to those schools (may not have user_agencies on the school)
  let assignedProviders = [];
  try {
    const [prov] = await pool.execute(
      `SELECT DISTINCT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level,
              ${PRESENCE_STATUS_JOIN}
       FROM users u
       INNER JOIN provider_school_assignments psa ON psa.provider_user_id = u.id
         AND psa.school_organization_id IN (${placeholders})
         AND psa.is_active = TRUE
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.first_name ASC, u.last_name ASC`,
      schoolIds
    );
    assignedProviders = prov || [];
  } catch {
    /* table/columns may vary — non-fatal */
  }

  const dedup = new Map();
  for (const r of [...(peers || []), ...assignedProviders]) {
    if (!dedup.has(r.id)) dedup.set(r.id, r);
  }
  return Array.from(dedup.values());
}

/**
 * School staff under schools affiliated to this platform agency.
 */
async function listAgencySchoolStaff(agencyId, roleFilter = 'school_staff') {
  const role = roleFilter || 'school_staff';
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level,
              ${PRESENCE_STATUS_JOIN}
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       INNER JOIN agencies school ON school.id = ua.agency_id
         AND LOWER(COALESCE(school.organization_type, '')) = 'school'
       INNER JOIN organization_affiliations oa ON oa.organization_id = school.id
         AND oa.agency_id = ?
         AND oa.is_active = 1
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND LOWER(COALESCE(u.role, '')) = ?
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [agencyId, role]
    );
    return rows || [];
  } catch {
    // Legacy fallback: agency_schools
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id,
                u.first_name,
                u.last_name,
                u.email,
                u.role,
                up.last_heartbeat_at,
                up.last_activity_at,
                up.availability_level,
                ${PRESENCE_STATUS_JOIN}
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         INNER JOIN agency_schools ash ON ash.school_id = ua.agency_id AND ash.agency_id = ?
         LEFT JOIN user_presence up ON up.user_id = u.id
         LEFT JOIN user_presence_status ps ON ps.user_id = u.id
         WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
           AND LOWER(COALESCE(u.role, '')) = ?
         ORDER BY u.first_name ASC, u.last_name ASC`,
        [agencyId, role]
      );
      return rows || [];
    } catch {
      return [];
    }
  }
}

export const listAgencyPresence = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    await assertAgencyAccess(req.user, agencyId);

    const viewerRole = req.user.role;
    const audience = normalizeAudience(req.query?.audience, viewerRole);
    const roleFilter = normalizeRoleFilter(req.query?.role);

    // School staff: DM directory is always school-scoped (not agency-wide team).
    if (isSchoolStaffRole(viewerRole) || audience === 'school') {
      let rows = await listSchoolScopedPresence(req.user.id);
      if (roleFilter) {
        rows = rows.filter((r) => String(r.role || '').toLowerCase() === roleFilter);
      }
      const enriched = await attachSchoolNames(rows);
      return res.json(mapChatPresenceRows(enriched, viewerRole));
    }

    // Privileged "directory" toggle: school staff / other non-default roles by type.
    if (audience === 'directory') {
      if (!canToggleDirectoryAudience(viewerRole)) {
        return res.status(403).json({
          error: { message: 'Directory audience toggle is restricted to admin/support/CPA' }
        });
      }
      const filterRole = roleFilter || 'school_staff';
      let rows = [];
      if (filterRole === 'school_staff') {
        rows = await listAgencySchoolStaff(agencyId, 'school_staff');
      } else {
        // Other role types within the agency membership
        const [agencyUsers] = await pool.execute(
          `SELECT u.id,
                  u.first_name,
                  u.last_name,
                  u.email,
                  u.role,
                  up.last_heartbeat_at,
                  up.last_activity_at,
                  up.availability_level,
                  ${PRESENCE_STATUS_JOIN}
           FROM users u
           INNER JOIN user_agencies ua ON ua.user_id = u.id
           LEFT JOIN user_presence up ON up.user_id = u.id
           LEFT JOIN user_presence_status ps ON ps.user_id = u.id
           WHERE ua.agency_id = ?
             AND (u.is_archived = FALSE OR u.is_archived IS NULL)
             AND LOWER(COALESCE(u.role, '')) = ?
           ORDER BY u.first_name ASC, u.last_name ASC`,
          [agencyId, filterRole]
        );
        rows = agencyUsers || [];
        // Also pull school-affiliated users of that role when not on agency row
        if (filterRole === 'provider' || filterRole === 'provider_plus') {
          const schoolRoleUsers = await listAgencySchoolStaff(agencyId, filterRole);
          const dedup = new Map(rows.map((r) => [r.id, r]));
          for (const r of schoolRoleUsers) {
            if (!dedup.has(r.id)) dedup.set(r.id, r);
          }
          rows = Array.from(dedup.values());
        }
      }
      const enriched = await attachSchoolNames(rows);
      return res.json(mapChatPresenceRows(enriched, viewerRole));
    }

    // Default: team employees only
    const teamPlaceholders = TEAM_EMPLOYEE_ROLES.map(() => '?').join(',');
    const [agencyUsers] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.availability_level,
              ${PRESENCE_STATUS_JOIN}
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND u.role IN (${teamPlaceholders})
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [agencyId, ...TEAM_EMPLOYEE_ROLES]
    );

    let superAdmins = [];
    if (canViewAdminsOnly(viewerRole)) {
      const [sa] = await pool.execute(
        `SELECT u.id,
                u.first_name,
                u.last_name,
                u.email,
                u.role,
                up.last_heartbeat_at,
                up.last_activity_at,
                up.availability_level,
                ${PRESENCE_STATUS_JOIN}
         FROM users u
         LEFT JOIN user_presence up ON up.user_id = u.id
         LEFT JOIN user_presence_status ps ON ps.user_id = u.id
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
    let rows = Array.from(dedup.values());
    if (roleFilter) {
      rows = rows.filter((r) => String(r.role || '').toLowerCase() === roleFilter);
    }
    const enriched = await attachSchoolNames(rows);
    res.json(mapChatPresenceRows(enriched, viewerRole));
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
              ${PRESENCE_STATUS_JOIN},
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agency_names
       FROM users u
       LEFT JOIN user_presence up ON up.user_id = u.id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       LEFT JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN agencies a ON a.id = ua.agency_id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND u.role IN ('admin', 'support', 'super_admin')
       GROUP BY u.id, u.first_name, u.last_name, u.email, u.role,
                up.last_heartbeat_at, up.last_activity_at, up.availability_level,
                ps.status, ps.note, ps.started_at, ps.ends_at, ps.expected_return_at,
                ps.reason, ps.display_label, ps.session_extend_until
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
        availability_level: computed.availability_level,
        status_label: computed.status_label,
        presence_status: computed.presence_status,
        presence_reason: computed.presence_reason,
        presence_display_label: computed.presence_display_label,
        presence_note: computed.presence_note,
        presence_expected_return_at: computed.presence_expected_return_at,
        presence_session_extend_until: computed.presence_session_extend_until
      };
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
};

// --- Team Board presence (status-based: In/Out/Traveling) ---

/**
 * List presence for Team Board.
 * Super-admin: all users. Admin: agency-scoped when agency has presenceEnabled.
 * GET /api/presence (root) or GET /api/presence/agency/:agencyId
 */
const mapPresenceRows = (rows) => {
  return (rows || []).map((r) => {
    const firstName = r.first_name || '';
    const lastName = r.last_name || '';
    const preferredName = r.preferred_name || '';
    const displayName = preferredName
      ? `${firstName} "${preferredName}" ${lastName}`.trim()
      : `${firstName} ${lastName}`.trim() || 'Unknown';
    const agencyIds = (r.agency_ids || '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((x) => !isNaN(x));
    return {
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      preferred_name: r.preferred_name,
      display_name: displayName,
      email: r.email,
      role: r.role,
      agency_ids: agencyIds,
      profile_photo_url: publicUploadsUrlFromStoredPath(r.profile_photo_path),
      presence_status: r.presence_status || null,
      presence_note: r.presence_note || null,
      presence_started_at: r.presence_started_at || null,
      presence_ends_at: r.presence_ends_at || null,
      presence_expected_return_at: r.presence_expected_return_at || null,
      presence_reason: r.presence_reason || null,
      presence_display_label: r.presence_display_label || null,
      presence_session_extend_until: r.presence_session_extend_until || null
    };
  });
};

export const listPresence = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    let rows;

    if (role === 'super_admin') {
      rows = await UserPresenceStatus.findAllWithUsers();
    } else {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    res.json(mapPresenceRows(rows));
  } catch (e) {
    next(e);
  }
};

/**
 * Admin: list presence for their agency's team (when agency has presenceEnabled).
 * GET /api/presence/agency/:agencyId/team
 */
export const listPresenceForAgency = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'super_admin') {
      const rows = await UserPresenceStatus.findAllWithUsersForAgency(agencyId);
      return res.json(mapPresenceRows(rows));
    }
    if (role !== 'admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const User = (await import('../models/User.model.js')).default;
    const userAgencies = await User.getAgencies(req.user.id);
    const hasAccess = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    }

    const [agencyRows] = await pool.execute(
      'SELECT feature_flags FROM agencies WHERE id = ?',
      [agencyId]
    );
    const agency = agencyRows?.[0];
    let flags = {};
    if (agency?.feature_flags) {
      try {
        flags = typeof agency.feature_flags === 'string'
          ? JSON.parse(agency.feature_flags)
          : agency.feature_flags;
      } catch {
        /* ignore */
      }
    }
    if (flags.presenceEnabled !== true) {
      return res.status(403).json({ error: { message: 'Presence is not enabled for this agency' } });
    }

    const rows = await UserPresenceStatus.findAllWithUsersForAgency(agencyId);
    res.json(mapPresenceRows(rows));
  } catch (e) {
    next(e);
  }
};

/**
 * Get current user's presence status (for staff self-update UI).
 * GET /api/presence/status/me
 */
export const getMyPresenceStatus = async (req, res, next) => {
  try {
    const row = await UserPresenceStatus.findByUserId(req.user.id);
    if (!row) {
      return res.json({
        presence_status: null,
        presence_note: null,
        presence_expected_return_at: null,
        presence_reason: null,
        presence_display_label: null,
        presence_session_extend_until: null
      });
    }
    res.json({
      presence_status: row.status,
      presence_note: row.note,
      presence_started_at: row.started_at,
      presence_ends_at: row.ends_at,
      presence_expected_return_at: row.expected_return_at,
      presence_reason: row.reason || null,
      presence_display_label: row.display_label || null,
      presence_session_extend_until: row.session_extend_until || null
    });
  } catch (e) {
    next(e);
  }
};

function maxOutQuickMinutes(role) {
  return UserPresenceStatus.isPrivilegedRole(role) ? 120 : 90;
}

/**
 * Update current user's presence status.
 * PUT /api/presence/status/me
 */
export const updateMyPresence = async (req, res, next) => {
  try {
    const {
      status,
      note,
      expected_return_at,
      started_at,
      ends_at,
      reason,
      display_label,
      session_extend_until,
      duration_minutes
    } = req.body || {};
    if (!status || !UserPresenceStatus.isValidStatus(status)) {
      return res.status(400).json({
        error: {
          message: `status must be one of: ${UserPresenceStatus.STATUS_ENUM.join(', ')}`
        }
      });
    }
    if (status === 'out_quick' && !expected_return_at && !note && !reason) {
      return res.status(400).json({
        error: { message: 'Out – Quick requires expected_return_at, note, or reason' }
      });
    }
    let extendUntil = session_extend_until || null;
    let returnAt = expected_return_at || null;
    const maxMins = maxOutQuickMinutes(req.user.role);
    if (status === 'out_quick' && expected_return_at) {
      const startedAt = started_at ? new Date(started_at) : new Date();
      const ret = new Date(expected_return_at);
      const minutes = (ret - startedAt) / (60 * 1000);
      if (minutes > maxMins) {
        return res.status(400).json({
          error: { message: `Out – Quick return time must be within ${maxMins} minutes of start` }
        });
      }
    }
    if (
      UserPresenceStatus.isPrivilegedRole(req.user.role) &&
      UserPresenceStatus.isAwayStatus(status) &&
      !extendUntil
    ) {
      const mins = Number(duration_minutes);
      if (Number.isFinite(mins) && mins > 0) {
        const capped = Math.min(120, Math.max(1, Math.floor(mins)));
        extendUntil = new Date(Date.now() + capped * 60 * 1000).toISOString();
        if (!returnAt) returnAt = extendUntil;
      }
    }
    const result = await UserPresenceStatus.upsertForUser(req.user.id, {
      status,
      note: note || null,
      expected_return_at: returnAt,
      started_at: started_at || null,
      ends_at: ends_at || null,
      reason: reason || null,
      display_label: display_label || null,
      session_extend_until: extendUntil
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * Privileged roles: set away/idle status with optional session extension (max 2h).
 * POST /api/presence/status/away
 * Body: { reason, durationMinutes?, expected_return_at?, note?, extendSession? }
 */
export const setAwayStatus = async (req, res, next) => {
  try {
    if (!UserPresenceStatus.isPrivilegedRole(req.user.role)) {
      return res.status(403).json({
        error: { message: 'Away status with session extension is restricted to admin/support users' }
      });
    }

    const reason = String(req.body?.reason || '').trim();
    if (!UserPresenceStatus.isValidReason(reason)) {
      return res.status(400).json({
        error: { message: `reason must be one of: ${UserPresenceStatus.REASON_ENUM.join(', ')}` }
      });
    }

    // Optional second facet: reachable while out (independent of why you're out).
    const reachableRaw = String(req.body?.reachable || '').trim();
    const reachable = ['call', 'text', 'call_text'].includes(reachableRaw) ? reachableRaw : null;
    const customLabel = String(req.body?.customLabel || req.body?.custom_label || '').trim().slice(0, 60);

    const extendSession = req.body?.extendSession !== false;
    let durationMinutes = Number(req.body?.durationMinutes ?? req.body?.duration_minutes);
    let expectedReturnAt = req.body?.expected_return_at || req.body?.expectedReturnAt || null;

    if (reason === 'out_day') {
      durationMinutes = null;
      expectedReturnAt = null;
    } else if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      if (expectedReturnAt) {
        durationMinutes = Math.round((new Date(expectedReturnAt).getTime() - Date.now()) / 60000);
      } else {
        durationMinutes = 60;
      }
    }

    if (reason !== 'out_day') {
      durationMinutes = Math.min(120, Math.max(15, Math.floor(durationMinutes)));
      if (!expectedReturnAt) {
        expectedReturnAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      }
    }

    // Out reason drives Team Board status; reachable is display-only (not a separate status).
    const status =
      reason === 'out_day'
        ? 'out_full_day'
        : UserPresenceStatus.statusForReason(
            reason === 'custom' ? 'personal' : reason,
            durationMinutes
          );
    let displayLabel =
      (reason === 'custom' && customLabel
        ? customLabel
        : UserPresenceStatus.labelForReason(reason)) || 'Away';
    if (reachable) {
      const reachLabel = UserPresenceStatus.labelForReason(reachable);
      if (reachLabel) displayLabel = `${displayLabel} · ${reachLabel}`;
    }
    const note = reachable || req.body?.note || null;
    const sessionExtendUntil =
      extendSession && reason !== 'out_day' && durationMinutes
        ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
        : null;

    // Keep chat availability visible while Away (Slack-like)
    await pool.execute(
      `INSERT INTO user_presence (user_id, availability_level, last_heartbeat_at, updated_at)
       VALUES (?, 'everyone', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         availability_level = 'everyone',
         last_heartbeat_at = NOW(),
         updated_at = NOW()`,
      [req.user.id]
    );

    const result = await UserPresenceStatus.upsertForUser(req.user.id, {
      status,
      note,
      expected_return_at: expectedReturnAt,
      reason,
      display_label: displayLabel,
      session_extend_until: sessionExtendUntil,
      ends_at: reason === 'out_day' ? null : expectedReturnAt
    });

    res.json({
      ok: true,
      ...result,
      session_extend_until: sessionExtendUntil,
      status_label: displayLabel
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Clear away status ("I'm back") → Active.
 * POST /api/presence/status/clear
 */
export const clearMyPresenceStatus = async (req, res, next) => {
  try {
    const result = await UserPresenceStatus.clearForUser(req.user.id);
    await pool.execute(
      `INSERT INTO user_presence (user_id, availability_level, last_heartbeat_at, last_activity_at, updated_at)
       VALUES (?, 'everyone', NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         availability_level = 'everyone',
         last_heartbeat_at = NOW(),
         last_activity_at = NOW(),
         updated_at = NOW()`,
      [req.user.id]
    );
    res.json({ ok: true, presence: result });
  } catch (e) {
    next(e);
  }
};

/**
 * Super-admin only: update any user's presence status (for testing).
 * PUT /api/presence/status/:userId
 */
export const updateUserPresence = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const { status, note, expected_return_at, started_at, ends_at } = req.body || {};
    if (!status || !UserPresenceStatus.isValidStatus(status)) {
      return res.status(400).json({
        error: {
          message: `status must be one of: ${UserPresenceStatus.STATUS_ENUM.join(', ')}`
        }
      });
    }
    if (status === 'out_quick' && !expected_return_at && !note) {
      return res.status(400).json({
        error: { message: 'Out – Quick requires expected_return_at or note (e.g. "Back by 2:15pm")' }
      });
    }
    if (status === 'out_quick' && expected_return_at) {
      const startedAt = started_at ? new Date(started_at) : new Date();
      const returnAt = new Date(expected_return_at);
      const minutes = (returnAt - startedAt) / (60 * 1000);
      if (minutes > 90) {
        return res.status(400).json({
          error: { message: 'Out – Quick return time must be within 90 minutes of start' }
        });
      }
    }
    const result = await UserPresenceStatus.upsertForUser(userId, {
      status,
      note: note || null,
      expected_return_at: expected_return_at || null,
      started_at: started_at || null,
      ends_at: ends_at || null
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * Super-admin only: bulk update presence status for multiple users.
 * POST /api/presence/bulk-update
 * Body: { userIds: number[], status, note?, expected_return_at?, started_at?, ends_at? }
 */
export const bulkUpdatePresence = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const { userIds, status, note, expected_return_at, started_at, ends_at } = req.body || {};
    const ids = Array.isArray(userIds) ? userIds.map((x) => parseInt(x, 10)).filter((x) => !isNaN(x) && x > 0) : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: { message: 'userIds must be a non-empty array' } });
    }
    if (!status || !UserPresenceStatus.isValidStatus(status)) {
      return res.status(400).json({
        error: { message: `status must be one of: ${UserPresenceStatus.STATUS_ENUM.join(', ')}` }
      });
    }
    if (status === 'out_quick' && !expected_return_at && !note) {
      return res.status(400).json({
        error: { message: 'Out – Quick requires expected_return_at or note' }
      });
    }
    if (status === 'out_quick' && expected_return_at) {
      const startedAt = started_at ? new Date(started_at) : new Date();
      const returnAt = new Date(expected_return_at);
      const minutes = (returnAt - startedAt) / (60 * 1000);
      if (minutes > 90) {
        return res.status(400).json({
          error: { message: 'Out – Quick return time must be within 90 minutes of start' }
        });
      }
    }

    const payload = {
      status,
      note: note || null,
      expected_return_at: expected_return_at || null,
      started_at: started_at || null,
      ends_at: ends_at || null
    };
    const results = [];
    for (const uid of ids) {
      const r = await UserPresenceStatus.upsertForUser(uid, payload);
      results.push({ userId: uid, ok: !!r });
    }
    res.json({ updated: results.length, results });
  } catch (e) {
    next(e);
  }
};

/**
 * Super-admin only: nudge a user whose Out – Quick return time has passed.
 * POST /api/presence/status/:userId/nudge
 */
export const nudgeUserPresence = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const presence = await UserPresenceStatus.findByUserId(userId);
    if (!presence || presence.status !== 'out_quick') {
      return res.status(400).json({ error: { message: 'User does not have Out – Quick status' } });
    }
    const expectedReturn = presence.expected_return_at ? new Date(presence.expected_return_at) : null;
    if (!expectedReturn || expectedReturn >= new Date()) {
      return res.status(400).json({ error: { message: 'Return time has not passed yet' } });
    }

    const targetUser = await User.findById(userId);
    const displayName = targetUser
      ? `${targetUser.first_name || ''} ${targetUser.last_name || ''}`.trim() || 'Someone'
      : 'Someone';
    const agencies = await User.getAgencies(userId);
    const agencyId = agencies?.[0]?.id || null;

    await Notification.create({
      type: 'presence_return_overdue_nudge',
      severity: 'info',
      title: 'Time to check in',
      message: `Your "Out – Quick" return time has passed. Please update your status when you're back.`,
      userId,
      agencyId,
      relatedEntityType: 'user_presence_status',
      relatedEntityId: presence.id,
      actorSource: 'System'
    });

    res.json({ ok: true, message: `Nudge sent to ${displayName}` });
  } catch (e) {
    next(e);
  }
};

