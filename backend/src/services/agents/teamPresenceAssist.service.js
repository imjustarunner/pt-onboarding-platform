/**
 * Live team presence snapshot for Ask Assistant ("who is available").
 * Uses the same chat model as Messages: Active / Idle / Inactive.
 * Idle = session_extend, Timedown phase, or soft activity idle — never Team Board enums.
 */
import pool from '../../config/database.js';
import { TEAM_EMPLOYEE_ROLES } from '../../utils/presenceAudience.js';

const OFFLINE_AFTER_MS = 6 * 60 * 1000;
const SOFT_IDLE_AFTER_MS = 2.5 * 60 * 1000;

function peerFacingStatusLabel(status) {
  if (status === 'online') return 'Active';
  if (status === 'idle') return 'Idle';
  return 'Inactive';
}

/** Human duration like "about 12 minutes" / "about 2 hours". */
export function formatDurationApprox(ms) {
  if (ms == null || ms === '') return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return null;
  const sec = Math.round(n / 1000);
  if (sec < 45) return 'under a minute';
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? 'about 1 minute' : `about ${min} minutes`;
  const hr = Math.round(min / 60);
  if (hr < 48) return hr === 1 ? 'about 1 hour' : `about ${hr} hours`;
  const days = Math.round(hr / 24);
  return days === 1 ? 'about 1 day' : `about ${days} days`;
}

function computeStatus(row, now = Date.now()) {
  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null;
  const activityAt = row?.last_activity_at ? new Date(row.last_activity_at).getTime() : null;
  const avail = String(row?.availability_level || 'everyone').toLowerCase();
  const extendUntil = row?.session_extend_until
    ? new Date(row.session_extend_until).getTime()
    : null;
  const statusStartedAt = row?.status_started_at
    ? new Date(row.status_started_at).getTime()
    : null;
  const phase = String(row?.session_phase || '').toLowerCase();
  const softIdle =
    hb && Number.isFinite(hb) && now - hb <= OFFLINE_AFTER_MS
    && activityAt && Number.isFinite(activityAt) && now - activityAt >= SOFT_IDLE_AFTER_MS;
  const extendIdle = Number.isFinite(extendUntil) && extendUntil > now;
  const phaseIdle = phase === 'timedown' || phase === 'away';
  const idleSession = extendIdle || phaseIdle || softIdle;

  let status = 'offline';
  if (idleSession) status = 'idle';
  else if (hb && now - hb <= OFFLINE_AFTER_MS) status = 'online';

  if (avail === 'offline' && status !== 'idle') status = 'offline';

  let idleReason = null;
  let idleForMs = null;
  if (status === 'idle') {
    if (extendIdle) {
      idleReason = 'session_extend';
      if (Number.isFinite(statusStartedAt) && statusStartedAt <= now) {
        idleForMs = now - statusStartedAt;
      } else if (Number.isFinite(activityAt) && activityAt <= now) {
        idleForMs = now - activityAt;
      }
    } else if (phaseIdle) {
      idleReason = phase === 'timedown' ? 'timedown' : 'away';
      if (Number.isFinite(activityAt) && activityAt <= now) idleForMs = now - activityAt;
    } else if (softIdle) {
      idleReason = 'soft_activity';
      // Soft idle starts after SOFT_IDLE_AFTER_MS of no activity.
      idleForMs = Math.max(0, now - activityAt - SOFT_IDLE_AFTER_MS);
      if (idleForMs < 30 * 1000 && Number.isFinite(activityAt)) {
        idleForMs = now - activityAt;
      }
    }
  }

  return {
    status,
    status_label: peerFacingStatusLabel(status),
    idle_reason: idleReason,
    idle_for_ms: idleForMs,
    idle_for_label: idleForMs != null ? formatDurationApprox(idleForMs) : null,
    last_activity_at: row?.last_activity_at || null,
    session_extend_until: extendIdle ? row.session_extend_until : null
  };
}

function nameMatchesQuery(name, email, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return true;
  const hay = `${String(name || '')} ${String(email || '')}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/**
 * @param {{ agencyId: number, viewerUserId?: number, includeOffline?: boolean, nameQuery?: string }} opts
 */
export async function listTeamPresenceForAssist({
  agencyId,
  viewerUserId = null,
  includeOffline = false,
  nameQuery = ''
} = {}) {
  const aId = parseInt(agencyId, 10);
  if (!aId) return { online: [], away: [], offline: [], people: [], nameQuery: null };

  const placeholders = TEAM_EMPLOYEE_ROLES.map(() => '?').join(',');
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
            ps.session_extend_until,
            ps.started_at AS status_started_at
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     LEFT JOIN user_presence up ON up.user_id = u.id
     LEFT JOIN user_presence_status ps ON ps.user_id = u.id
     WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND u.role IN (${placeholders})
     ORDER BY u.first_name ASC, u.last_name ASC`,
    [aId, ...TEAM_EMPLOYEE_ROLES]
  );

  const q = String(nameQuery || '').trim();
  const people = [];
  for (const r of rows || []) {
    if (viewerUserId && Number(r.id) === Number(viewerUserId)) continue;
    const computed = computeStatus(r);
    const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.id}`;
    if (q && !nameMatchesQuery(name, r.email, q)) continue;
    // When asking about a named person, include them even if offline.
    if (!includeOffline && !q && computed.status === 'offline') continue;
    people.push({
      id: r.id,
      name,
      role: r.role,
      status: computed.status,
      status_label: computed.status_label,
      idle_reason: computed.idle_reason,
      idle_for_ms: computed.idle_for_ms,
      idle_for_label: computed.idle_for_label,
      last_activity_at: computed.last_activity_at,
      session_extend_until: computed.session_extend_until,
      expected_return_at: null
    });
  }

  const online = people.filter((p) => p.status === 'online');
  const away = people.filter((p) => p.status === 'idle');
  const offline = people.filter((p) => p.status === 'offline');

  return {
    online,
    away,
    offline,
    people,
    agencyId: aId,
    nameQuery: q || null
  };
}
