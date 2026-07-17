/**
 * Live team presence snapshot for Ask Assistant ("who is available").
 */
import pool from '../../config/database.js';
import { TEAM_EMPLOYEE_ROLES } from '../../utils/presenceAudience.js';

const IDLE_AFTER_MS = 5 * 60 * 1000;
const OFFLINE_AFTER_MS = 6 * 60 * 1000;

function computeStatus(row) {
  const now = Date.now();
  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null;
  const act = row?.last_activity_at ? new Date(row.last_activity_at).getTime() : null;
  const avail = String(row?.availability_level || 'everyone').toLowerCase();
  const label = row?.display_label || row?.presence_display_label || null;
  const reason = row?.reason || row?.presence_reason || null;
  const extendUntil = row?.session_extend_until
    ? new Date(row.session_extend_until).getTime()
    : null;
  const awayActive = extendUntil && extendUntil > now;

  let status = 'offline';
  if (awayActive) status = 'idle';
  else if (hb && now - hb <= OFFLINE_AFTER_MS) {
    if (act && now - act >= IDLE_AFTER_MS) status = 'idle';
    else status = 'online';
  }
  if (avail === 'offline' && !awayActive) status = 'offline';

  return {
    status,
    status_label:
      label ||
      (reason
        ? String(reason).replace(/_/g, ' ')
        : status === 'online'
          ? 'Active'
          : status === 'idle'
            ? 'Away'
            : 'Offline')
  };
}

/**
 * @param {{ agencyId: number, viewerUserId?: number, includeOffline?: boolean }} opts
 */
export async function listTeamPresenceForAssist({ agencyId, viewerUserId = null, includeOffline = false }) {
  const aId = parseInt(agencyId, 10);
  if (!aId) return { online: [], away: [], offline: [], people: [] };

  const placeholders = TEAM_EMPLOYEE_ROLES.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT u.id,
            u.first_name,
            u.last_name,
            u.email,
            u.role,
            up.last_heartbeat_at,
            up.last_activity_at,
            up.availability_level,
            ps.display_label,
            ps.reason,
            ps.session_extend_until,
            ps.expected_return_at
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

  const people = [];
  for (const r of rows || []) {
    if (viewerUserId && Number(r.id) === Number(viewerUserId)) continue;
    const computed = computeStatus(r);
    if (!includeOffline && computed.status === 'offline') continue;
    const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.id}`;
    people.push({
      id: r.id,
      name,
      role: r.role,
      status: computed.status,
      status_label: computed.status_label,
      expected_return_at: r.expected_return_at || null
    });
  }

  const online = people.filter((p) => p.status === 'online');
  const away = people.filter((p) => p.status === 'idle');
  const offline = people.filter((p) => p.status === 'offline');

  return { online, away, offline, people, agencyId: aId };
}
