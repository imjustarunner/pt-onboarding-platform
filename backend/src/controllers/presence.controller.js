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
import {
  attachCalendarBusyToPresenceRows,
  getCurrentCalendarBusyForUser
} from '../services/calendarPresence.service.js';

/**
 * Chat / Messages presence (new model):
 * - Active (`online`): fresh heartbeat, not in a signed-in Idle session
 * - Idle (`idle`): Timedown countdown page, Away/session_extend, or soft activity idle
 * - Inactive (`offline`): stale/no heartbeat, appear-offline, or timed out
 *
 * Do NOT use legacy Team Board enums (`out_am`, `out_full_day`, …)
 * or meal/reason display labels to drive peer-facing chat presence — that path was broken.
 */
/** Max heartbeat interval is 300s; allow buffer so slow cadence does not false-inactive. */
const OFFLINE_AFTER_MS = 6 * 60 * 1000;
/**
 * Fresh heartbeat + no DOM activity for this long → Idle/Away (covers Timedown page
 * and the quiet period before Timedown for privileged 10+10 flow).
 */
const SOFT_IDLE_AFTER_MS = 2.5 * 60 * 1000;

function defaultAvailabilityForRole(_role) {
  // Heartbeat alone shows Active. Explicit offline / admins_only still honored.
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

/** Signed-in Idle = Away overlay (session extend) OR Timedown / soft inactivity. */
function hasChatIdleSession(row) {
  const until = richStatusFields(row).presence_session_extend_until;
  if (until) {
    const ext = new Date(until).getTime();
    if (Number.isFinite(ext) && ext > Date.now()) return true;
  }
  const phase = String(row?.session_phase || row?.presence_session_phase || '').toLowerCase();
  if (phase === 'timedown' || phase === 'away') return true;
  return false;
}

/** Heartbeat is fresh but activity is stale → Idle (Timedown countdown / stepped away). */
function hasSoftActivityIdle(row, now = Date.now()) {
  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null;
  const activityAt = row?.last_activity_at ? new Date(row.last_activity_at).getTime() : null;
  if (!hb || !Number.isFinite(hb) || now - hb > OFFLINE_AFTER_MS) return false;
  if (!activityAt || !Number.isFinite(activityAt)) return false;
  return now - activityAt >= SOFT_IDLE_AFTER_MS;
}

/** Peer-facing labels only — never meal/Team Board copy. */
function peerFacingStatusLabel(status) {
  if (status === 'online') return 'Active';
  if (status === 'idle') return 'Idle';
  return 'Inactive';
}

/**
 * Drop timed Away overlays whose return/end time has already passed so board/chat
 * do not keep showing "Out for Personal · Back 2:27 PM" from a prior day.
 */
function applyExpiredTimedAway(row) {
  if (!row || !UserPresenceStatus.isTimedAwayExpired(row)) return row;
  return {
    ...row,
    presence_status: 'in_available',
    rich_status: 'in_available',
    presence_reason: null,
    reason: null,
    presence_note: null,
    note: null,
    presence_display_label: 'Active',
    display_label: 'Active',
    presence_expected_return_at: null,
    expected_return_at: null,
    presence_ends_at: null,
    ends_at: null,
    presence_session_extend_until: null,
    session_extend_until: null
  };
}

/**
 * Shared availability bands for Team Board + Messages dots.
 * available | away_reachable | unavailable | available_offline | offline
 */
function computeAvailabilityBand(row, wireStatus) {
  const effective = applyExpiredTimedAway(row);
  const reason = String(effective?.presence_reason || effective?.reason || '').trim();
  const note = String(effective?.presence_note || effective?.note || '').trim();
  const richStatus = String(effective?.presence_status || effective?.rich_status || '').trim();
  const display = String(effective?.presence_display_label || effective?.display_label || '').toLowerCase();
  const reachable =
    UserPresenceStatus.isReachableNote(note) ||
    ['call', 'text', 'call_text'].includes(reason) ||
    display.includes('available for call') ||
    display.includes('available for text');

  if (reason === 'available_offline') return 'available_offline';

  const wire = String(wireStatus || '').toLowerCase();
  if (wire === 'online') {
    if (richStatus === 'in_heads_down') return 'unavailable';
    if (UserPresenceStatus.isAwayStatus(richStatus)) {
      return reachable || richStatus === 'in_available_for_phone' ? 'away_reachable' : 'unavailable';
    }
    return 'available';
  }

  if (wire === 'idle') {
    if (reachable || richStatus === 'in_available_for_phone') return 'away_reachable';
    // Explicit Away reasons stay red/unavailable when not reachable.
    if (UserPresenceStatus.isAwayStatus(richStatus) || richStatus === 'in_heads_down') {
      return 'unavailable';
    }
    // Timedown / soft idle with no status chosen yet → Away (yellow).
    return 'away_reachable';
  }

  // Offline / no heartbeat
  if (reason === 'available_offline') return 'available_offline';
  if (UserPresenceStatus.isAwayStatus(richStatus) || richStatus === 'in_heads_down') {
    return reachable ? 'away_reachable' : 'unavailable';
  }
  return 'offline';
}

function availabilityBandLabel(band) {
  switch (String(band || '')) {
    case 'available':
      return 'Available';
    case 'away_reachable':
      return 'Away · reachable';
    case 'unavailable':
      return 'Unavailable';
    case 'available_offline':
      return 'Available · logged out';
    default:
      return 'Inactive';
  }
}

function computePresenceStatus(row, viewerRole) {
  const now = Date.now();
  const effectiveRow = applyExpiredTimedAway(row);
  const hb = effectiveRow?.last_heartbeat_at ? new Date(effectiveRow.last_heartbeat_at).getTime() : null;
  const rich = richStatusFields(effectiveRow);
  const idleSession = hasChatIdleSession(effectiveRow) || hasSoftActivityIdle(effectiveRow, now);
  const reason = String(rich?.presence_reason || '').trim();

  let status = 'offline';
  if (reason === 'available_offline') {
    // Logged out but marked available — never treat as online/idle from a stale heartbeat.
    status = 'offline';
  } else if (idleSession) {
    // Stay Idle while Timedown / Away overlay is active even if the tab is briefly hidden.
    status = 'idle';
  } else if (hb && now - hb <= OFFLINE_AFTER_MS) {
    status = 'online';
  }

  const availabilityLevel =
    normalizeAvailability(effectiveRow?.availability_level) ||
    defaultAvailabilityForRole(effectiveRow?.role || viewerRole);

  if (availabilityLevel === 'offline' && status !== 'idle' && reason !== 'available_offline') {
    status = 'offline';
  }
  if (availabilityLevel === 'admins_only' && !canViewAdminsOnly(viewerRole) && status !== 'idle') {
    status = 'offline';
  }

  const band = computeAvailabilityBand({ ...effectiveRow, ...rich }, status);
  let statusLabel = availabilityBandLabel(band);
  if (status === 'idle') {
    const richLabel = String(rich?.presence_display_label || '').trim();
    if (richLabel && richLabel.toLowerCase() !== 'active') statusLabel = richLabel;
    else {
      const fromReason = UserPresenceStatus.labelForReason(reason);
      statusLabel = fromReason || 'Away';
    }
  }

  return {
    status,
    availability_level: availabilityLevel,
    ...rich,
    availability_band: band,
    status_label: statusLabel
  };
}

/** Self UI may show meal/reason; peers never get those fields from chat directory APIs. */
function selfFacingStatusLabel(computed) {
  if (computed.status === 'idle') {
    return (
      computed.presence_display_label ||
      UserPresenceStatus.labelForReason(computed.presence_reason) ||
      'Idle'
    );
  }
  if (computed.status === 'online') {
    return computed.presence_display_label || 'Active';
  }
  return 'Inactive';
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
    const phaseRaw = String(req.body?.sessionPhase || req.body?.session_phase || '').toLowerCase();
    const sessionPhase = ['timedown', 'away', 'active'].includes(phaseRaw) ? phaseRaw : 'active';

    if (agencyId) {
      await assertAgencyAccess(req.user, agencyId);
    }

    const defaultAvail = defaultAvailabilityForRole(req.user.role);
    // session_phase column added in migration 1015 — fall back if not applied yet.
    try {
      await pool.execute(
        `INSERT INTO user_presence (user_id, agency_id, last_heartbeat_at, last_activity_at, availability_level, session_phase)
         VALUES (?, ?, NOW(), ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           agency_id = VALUES(agency_id),
           last_heartbeat_at = NOW(),
           last_activity_at = COALESCE(VALUES(last_activity_at), last_activity_at),
           availability_level = COALESCE(availability_level, VALUES(availability_level)),
           session_phase = VALUES(session_phase)`,
        [
          userId,
          agencyId,
          lastActivityAt ? lastActivityAt.toISOString().slice(0, 19).replace('T', ' ') : null,
          defaultAvail,
          sessionPhase
        ]
      );
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.includes('session_phase') && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
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
    }

    // Signing back in clears "Available · Logged out".
    try {
      await pool.execute(
        `UPDATE user_presence_status
         SET reason = NULL,
             display_label = 'Active',
             status = 'in_available',
             session_extend_until = NULL,
             expected_return_at = NULL,
             note = NULL
         WHERE user_id = ? AND reason = 'available_offline'`,
        [userId]
      );
    } catch {
      /* ignore */
    }

    // Timed Away whose "Back by …" time already passed → Available again.
    try {
      await UserPresenceStatus.clearIfTimedAwayExpired(userId);
    } catch {
      /* ignore */
    }

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
      `SELECT up.user_id, up.last_heartbeat_at, up.last_activity_at, up.session_phase, up.availability_level,
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

    // Persist clear when timed Away return time has passed (stale "Back by …" from prior days).
    if (UserPresenceStatus.isTimedAwayExpired(merged)) {
      try {
        const cleared = await UserPresenceStatus.clearForUser(userId);
        if (cleared) {
          merged = {
            ...(merged || {}),
            presence_status: cleared.status,
            presence_note: cleared.note,
            presence_started_at: cleared.started_at,
            presence_ends_at: cleared.ends_at,
            presence_expected_return_at: cleared.expected_return_at,
            presence_reason: cleared.reason,
            presence_display_label: cleared.display_label,
            presence_session_extend_until: cleared.session_extend_until
          };
        }
      } catch {
        /* ignore */
      }
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

    // Self keeps rich Away labels (e.g. Out for Meal). Peers never see those via directory APIs.
    let statusLabel = selfFacingStatusLabel(computed);
    let displayLabel = computed.presence_display_label || statusLabel;
    let calendarBusy = null;
    // Calendar busy overlays Active only — Idle stays Idle (not Team Board / meal copy).
    if (computed.status === 'online') {
      try {
        const busy = await getCurrentCalendarBusyForUser(userId);
        if (busy?.label) {
          statusLabel = busy.label;
          displayLabel = busy.label;
          calendarBusy = busy.activityType;
        }
      } catch {
        /* ignore */
      }
    }

    res.json({
      user_id: userId,
      availability_level: computed.availability_level,
      heartbeat_status: computed.status,
      status: computed.status,
      status_label: statusLabel,
      presence_status: computed.presence_status,
      presence_reason: computed.presence_reason,
      presence_display_label: displayLabel,
      presence_note: computed.presence_note,
      presence_expected_return_at: computed.presence_expected_return_at,
      presence_session_extend_until: sessionExtendUntil,
      session_extend_active: sessionExtendActive,
      calendar_busy: calendarBusy
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

function parseColorPalette(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Attach peer agency memberships that overlap the viewer's memberships
 * (viewer-scoped — never expose tenants the viewer does not share).
 * Super-admins with no memberships see peer agency-type orgs (platform view).
 */
async function attachSharedAgencyMemberships(rows, viewerUserId, { viewerRole } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const peerIds = [...new Set(list.map((r) => Number(r.id || 0)).filter((n) => n > 0))];
  if (!peerIds.length) return list;

  let viewerAgencyIds = [];
  try {
    const [vRows] = await pool.execute(
      `SELECT agency_id FROM user_agencies WHERE user_id = ?`,
      [viewerUserId]
    );
    viewerAgencyIds = (vRows || []).map((r) => Number(r.agency_id)).filter((n) => n > 0);
  } catch {
    viewerAgencyIds = [];
  }

  const isSuperAdmin = String(viewerRole || '').toLowerCase() === 'super_admin';
  const restrictToViewer = !(isSuperAdmin && viewerAgencyIds.length === 0);
  if (restrictToViewer && !viewerAgencyIds.length) {
    return list.map((r) => ({
      ...r,
      shared_agency_ids: [],
      shared_agency_memberships: []
    }));
  }

  const peerPh = peerIds.map(() => '?').join(',');
  const params = [...peerIds];
  let agencyFilterSql = '';
  if (restrictToViewer) {
    const vPh = viewerAgencyIds.map(() => '?').join(',');
    agencyFilterSql = `AND ua.agency_id IN (${vPh})`;
    params.push(...viewerAgencyIds);
  } else {
    // Platform view: agency-type tenants only (skip school/program noise)
    agencyFilterSql = `AND LOWER(COALESCE(a.organization_type, 'agency')) IN ('agency', 'organization', '')`;
  }

  try {
    // agencies has logo_* + icon_id; icon file path comes from icons join (not a.icon_file_path).
    const [mRows] = await pool.execute(
      `SELECT ua.user_id,
              a.id,
              a.name,
              a.slug,
              a.organization_type,
              a.logo_url,
              a.logo_path,
              i.file_path AS icon_file_path,
              a.color_palette
       FROM user_agencies ua
       INNER JOIN agencies a ON a.id = ua.agency_id
       LEFT JOIN icons i ON i.id = a.icon_id
       WHERE ua.user_id IN (${peerPh})
         ${agencyFilterSql}
       ORDER BY a.name ASC`,
      params
    );
    const byUser = new Map();
    for (const row of mRows || []) {
      const uid = Number(row.user_id);
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      const palette = parseColorPalette(row.color_palette);
      const name = String(row.name || '').trim();
      byUser.get(uid).push({
        id: Number(row.id),
        name: name || `Tenant ${row.id}`,
        slug: row.slug || null,
        organization_type: row.organization_type || 'agency',
        logo_url: row.logo_url || null,
        logo_path: row.logo_path || null,
        icon_file_path: row.icon_file_path || null,
        color_palette: palette,
        primary_color: palette?.primary || palette?.primaryColor || null
      });
    }
    return list.map((r) => {
      const memberships = byUser.get(Number(r.id)) || [];
      return {
        ...r,
        shared_agency_ids: memberships.map((m) => m.id),
        shared_agency_memberships: memberships
      };
    });
  } catch {
    return list.map((r) => ({
      ...r,
      shared_agency_ids: r.shared_agency_ids || [],
      shared_agency_memberships: r.shared_agency_memberships || []
    }));
  }
}

async function finalizeChatPresenceRows(rows, viewerUserId, viewerRole) {
  // Best-effort: drop stale timed Away before mapping so directory/board stay current.
  try {
    await UserPresenceStatus.clearExpiredTimedAwayStatuses();
  } catch {
    /* ignore */
  }
  const withSchools = await attachSchoolNames(rows);
  const withShared = await attachSharedAgencyMemberships(withSchools, viewerUserId, { viewerRole });
  return attachCalendarBusyToPresenceRows(mapChatPresenceRows(withShared, viewerRole));
}

function mapChatPresenceRows(rows, viewerRole) {
  const privilegedViewer = UserPresenceStatus.isPrivilegedRole(viewerRole);
  return (rows || []).map((r) => {
    const computed = computePresenceStatus(r, viewerRole);
    // Shared availability band for dots (Team Board + chat). Meal/reason detail stays
    // privileged-only so Messages peers see Available / Away · reachable / Unavailable.
    return {
      ...r,
      status: computed.status,
      availability_level: computed.availability_level,
      availability_band: computed.availability_band,
      status_label: computed.status_label || peerFacingStatusLabel(computed.status),
      presence_status: privilegedViewer ? computed.presence_status : null,
      presence_reason: privilegedViewer ? computed.presence_reason : null,
      presence_display_label: privilegedViewer ? computed.presence_display_label : null,
      presence_note: privilegedViewer ? computed.presence_note : null,
      presence_expected_return_at: privilegedViewer
        ? computed.presence_expected_return_at
        : null,
      presence_session_extend_until:
        computed.status === 'idle' || computed.availability_band === 'away_reachable'
          ? computed.presence_session_extend_until
          : null,
      has_billing_access: !!(r.has_billing_access === 1 || r.has_billing_access === true),
      has_payroll_access: !!(r.has_payroll_access === 1 || r.has_payroll_access === true),
      can_manage_credentialing: !!(
        r.can_manage_credentialing === 1 || r.can_manage_credentialing === true
      )
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
            up.session_phase,
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
              up.session_phase,
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
              up.session_phase,
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
                up.session_phase,
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
      return res.json(await finalizeChatPresenceRows(rows, req.user.id, viewerRole));
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
                  up.session_phase,
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
      return res.json(await finalizeChatPresenceRows(rows, req.user.id, viewerRole));
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
              up.session_phase,
              up.availability_level,
              COALESCE(ua.has_billing_access, 0) AS has_billing_access,
              COALESCE(ua.has_payroll_access, 0) AS has_payroll_access,
              COALESCE(ua.can_manage_credentialing, 0) AS can_manage_credentialing,
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
                up.session_phase,
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
    res.json(await finalizeChatPresenceRows(rows, req.user.id, viewerRole));
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

    await UserPresenceStatus.clearExpiredTimedAwayStatuses();

    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role,
              up.last_heartbeat_at,
              up.last_activity_at,
              up.session_phase,
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
                up.last_heartbeat_at, up.last_activity_at, up.session_phase, up.availability_level,
                ps.status, ps.note, ps.started_at, ps.ends_at, ps.expected_return_at,
                ps.reason, ps.display_label, ps.session_extend_until
       ORDER BY u.first_name ASC, u.last_name ASC`
    );

    const mapped = mapChatPresenceRows(
      (rows || []).map((r) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        role: r.role,
        agency_names: r.agency_names || '',
        last_heartbeat_at: r.last_heartbeat_at,
        last_activity_at: r.last_activity_at,
        availability_level: r.availability_level,
        presence_status: r.presence_status,
        presence_note: r.presence_note,
        presence_started_at: r.presence_started_at,
        presence_ends_at: r.presence_ends_at,
        presence_expected_return_at: r.presence_expected_return_at,
        presence_reason: r.presence_reason,
        presence_display_label: r.presence_display_label,
        presence_session_extend_until: r.presence_session_extend_until
      })),
      req.user.role
    );

    const withShared = await attachSharedAgencyMemberships(mapped, req.user.id, {
      viewerRole: req.user.role
    });
    res.json(await attachCalendarBusyToPresenceRows(withShared));
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
    const computed = computePresenceStatus(r, r.role);
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
      status: computed.status,
      availability_band: computed.availability_band,
      status_label: computed.status_label,
      last_heartbeat_at: r.last_heartbeat_at || null,
      // Prefer computed (may have cleared expired timed Away) over raw DB fields.
      presence_status: computed.presence_status || null,
      presence_note: computed.presence_note || null,
      presence_started_at: r.presence_started_at || null,
      presence_ends_at: computed.presence_ends_at || null,
      presence_expected_return_at: computed.presence_expected_return_at || null,
      presence_reason: computed.presence_reason || null,
      presence_display_label: computed.presence_display_label || null,
      presence_session_extend_until: computed.presence_session_extend_until || null
    };
  });
};

export const listPresence = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    let rows;

    if (role === 'super_admin') {
      await UserPresenceStatus.clearExpiredTimedAwayStatuses();
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
    await UserPresenceStatus.clearExpiredTimedAwayStatuses();
    if (role === 'super_admin') {
      const rows = await UserPresenceStatus.findAllWithUsersForAgency(agencyId);
      return res.json(mapPresenceRows(rows));
    }
    // Admin + support need meal/day detail on Team Board (Messages peers stay Idle-only).
    if (role !== 'admin' && role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin or support access required' } });
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
    let row = await UserPresenceStatus.findByUserId(req.user.id);
    if (UserPresenceStatus.isTimedAwayExpired(row)) {
      row = await UserPresenceStatus.clearForUser(req.user.id);
    }
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
 * Body: { reason, durationMinutes?, expected_return_at?, note?, extendSession?, timerMode? }
 * timerMode: 'reset' (default) recomputes return time from now; 'continue' keeps existing timer.
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
    const timerModeRaw = String(req.body?.timerMode || req.body?.timer_mode || 'reset')
      .trim()
      .toLowerCase();
    const timerMode = timerModeRaw === 'continue' ? 'continue' : 'reset';

    let durationMinutes = Number(req.body?.durationMinutes ?? req.body?.duration_minutes);
    let expectedReturnAt = req.body?.expected_return_at || req.body?.expectedReturnAt || null;
    let sessionExtendUntil = null;
    let continuingTimer = false;

    if (reason !== 'out_day' && timerMode === 'continue') {
      const existing = await UserPresenceStatus.findByUserId(req.user.id);
      const existingUntilRaw =
        existing?.session_extend_until || existing?.expected_return_at || null;
      const existingUntilMs = existingUntilRaw ? new Date(existingUntilRaw).getTime() : NaN;
      if (Number.isFinite(existingUntilMs) && existingUntilMs > Date.now()) {
        continuingTimer = true;
        sessionExtendUntil = new Date(existingUntilMs).toISOString();
        expectedReturnAt = sessionExtendUntil;
        durationMinutes = Math.max(1, Math.ceil((existingUntilMs - Date.now()) / 60000));
      }
    }

    const isAvailableOffline = reason === 'available_offline';

    if (reason === 'out_day' || isAvailableOffline) {
      durationMinutes = null;
      expectedReturnAt = null;
      sessionExtendUntil = null;
    } else if (!continuingTimer) {
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        if (expectedReturnAt) {
          durationMinutes = Math.round((new Date(expectedReturnAt).getTime() - Date.now()) / 60000);
        } else {
          durationMinutes = 60;
        }
      }

      durationMinutes = Math.min(120, Math.max(15, Math.floor(durationMinutes)));
      expectedReturnAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      sessionExtendUntil =
        extendSession && durationMinutes
          ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
          : null;
    } else if (!extendSession) {
      sessionExtendUntil = null;
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
    if (reachable && !isAvailableOffline) {
      const reachLabel = UserPresenceStatus.labelForReason(reachable);
      if (reachLabel) displayLabel = `${displayLabel} · ${reachLabel}`;
    }
    const note = isAvailableOffline ? null : reachable || req.body?.note || null;

    if (isAvailableOffline) {
      // Mark available while logged out — clear heartbeat so wire status is offline.
      await pool.execute(
        `INSERT INTO user_presence (user_id, availability_level, last_heartbeat_at, updated_at)
         VALUES (?, 'everyone', NULL, NOW())
         ON DUPLICATE KEY UPDATE
           availability_level = 'everyone',
           last_heartbeat_at = NULL,
           updated_at = NOW()`,
        [req.user.id]
      );
    } else {
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
    }

    const result = await UserPresenceStatus.upsertForUser(req.user.id, {
      status,
      note,
      expected_return_at: expectedReturnAt,
      reason,
      display_label: displayLabel,
      session_extend_until: sessionExtendUntil,
      ends_at: reason === 'out_day' || isAvailableOffline ? null : expectedReturnAt
    });

    res.json({
      ok: true,
      ...result,
      session_extend_until: sessionExtendUntil,
      status_label: displayLabel,
      timer_mode: continuingTimer ? 'continue' : 'reset'
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Clear away status ("I'm back") → Active.
 * POST /api/presence/status/clear
 * Notifies admin / support / super_admin via a 5-minute toast when the user was away.
 */
export const clearMyPresenceStatus = async (req, res, next) => {
  try {
    const prior = await UserPresenceStatus.findByUserId(req.user.id);
    const priorExtendMs = prior?.session_extend_until
      ? new Date(prior.session_extend_until).getTime()
      : NaN;
    const wasAway = !!(
      prior &&
      ((Number.isFinite(priorExtendMs) && priorExtendMs > Date.now()) ||
        (prior.reason && String(prior.reason).trim()) ||
        (prior.display_label &&
          String(prior.display_label).trim() &&
          String(prior.display_label).trim().toLowerCase() !== 'active') ||
        (prior.status &&
          String(prior.status).toLowerCase() !== 'in_available'))
    );

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

    if (wasAway) {
      try {
        const user = await User.findById(req.user.id);
        const displayName = user
          ? `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() ||
            user.email ||
            'Someone'
          : 'Someone';
        const agencies = await User.getAgencies(req.user.id);
        const agencyId = agencies?.[0]?.id || null;
        const priorLabel =
          (prior?.display_label && String(prior.display_label).trim()) ||
          (prior?.reason ? UserPresenceStatus.labelForReason(prior.reason) : null) ||
          'Away';
        await Notification.create({
          type: 'presence_user_returned',
          severity: 'info',
          title: `${displayName} is back`,
          message: `${displayName} returned from ${priorLabel}.`,
          audienceJson: {
            admin: true,
            clinicalPracticeAssistant: false,
            provider: false,
            supervisor: false,
            schoolStaff: false
          },
          userId: req.user.id,
          agencyId,
          relatedEntityType: 'user',
          relatedEntityId: req.user.id,
          actorUserId: req.user.id,
          actorSource: 'System'
        });
      } catch (notifyErr) {
        console.warn('[presence] failed to create return notification', notifyErr?.message || notifyErr);
      }
    }

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

