import pool from '../config/database.js';

const OFFICE_TYPES = new Set(['clinical', 'learning']);
const WINDOW_DAYS = 30;

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function isOfficeClientType(type) {
  return OFFICE_TYPES.has(String(type || '').toLowerCase());
}

/**
 * Close any open assignment event for a client, then open a new one when assigning
 * an office/clinical client to a provider. Also stamps clients.provider_assigned_at.
 */
export async function recordProviderAssignmentChange({
  connection = null,
  clientId,
  agencyId,
  clientType,
  oldProviderUserId,
  newProviderUserId,
  actingUserId = null,
}) {
  const cid = safeInt(clientId);
  if (!cid) return null;
  const exec = connection ? connection.execute.bind(connection) : pool.execute.bind(pool);

  const oldPid = safeInt(oldProviderUserId);
  const newPid = safeInt(newProviderUserId);
  if (oldPid === newPid) return null;

  if (oldPid) {
    await exec(
      `UPDATE office_client_assignment_events
       SET ended_at = NOW()
       WHERE client_id = ? AND provider_user_id = ? AND ended_at IS NULL`,
      [cid, oldPid]
    );
  }

  if (!newPid || !isOfficeClientType(clientType)) {
    await exec(`UPDATE clients SET provider_assigned_at = NULL WHERE id = ?`, [cid]);
    return null;
  }

  const aid = safeInt(agencyId);
  if (!aid) return null;

  await exec(
    `UPDATE clients SET provider_assigned_at = NOW() WHERE id = ?`,
    [cid]
  );

  const [result] = await exec(
    `INSERT INTO office_client_assignment_events
       (agency_id, client_id, provider_user_id, assigned_at, assigned_by_user_id)
     VALUES (?, ?, ?, NOW(), ?)`,
    [aid, cid, newPid, safeInt(actingUserId)]
  );
  return safeInt(result?.insertId);
}

/** Mark exchange outcome on the open assignment event for this client+provider. */
export async function recordExchangePosted({
  clientId,
  providerUserId,
  listingId,
  postedAt = null,
}) {
  const cid = safeInt(clientId);
  const pid = safeInt(providerUserId);
  const lid = safeInt(listingId);
  if (!cid || !pid) return false;

  const [rows] = await pool.execute(
    `SELECT id, marked_current_at, exchanged_at
     FROM office_client_assignment_events
     WHERE client_id = ? AND provider_user_id = ? AND ended_at IS NULL
     ORDER BY assigned_at DESC
     LIMIT 1`,
    [cid, pid]
  );
  const event = rows?.[0];
  if (!event) return false;
  if (event.exchanged_at) return true;

  const beforeCurrent = event.marked_current_at ? 0 : 1;
  await pool.execute(
    `UPDATE office_client_assignment_events
     SET exchanged_at = COALESCE(?, NOW()),
         exchange_listing_id = ?,
         exchanged_before_current = ?
     WHERE id = ?`,
    [postedAt || null, lid, beforeCurrent, event.id]
  );
  return true;
}

/** Stamp marked_current_at on the open office assignment event. */
export async function recordMarkedCurrent({ clientId, providerUserId }) {
  const cid = safeInt(clientId);
  const pid = safeInt(providerUserId);
  if (!cid || !pid) return false;

  await pool.execute(
    `UPDATE office_client_assignment_events
     SET marked_current_at = COALESCE(marked_current_at, NOW())
     WHERE client_id = ? AND provider_user_id = ? AND ended_at IS NULL`,
    [cid, pid]
  );
  return true;
}

function classifyEvent(row, windowDays = WINDOW_DAYS) {
  const assignedAt = row.assigned_at ? new Date(row.assigned_at) : null;
  const exchangedAt = row.exchanged_at ? new Date(row.exchanged_at) : null;
  const markedCurrentAt = row.marked_current_at ? new Date(row.marked_current_at) : null;
  const now = new Date();
  const windowMs = Math.max(1, Number(windowDays) || WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const windowEnd = assignedAt ? new Date(assignedAt.getTime() + windowMs) : null;
  const exchangedWithinWindow = Boolean(
    exchangedAt && assignedAt && exchangedAt.getTime() <= windowEnd.getTime()
  );
  const pastWindow = Boolean(windowEnd && now.getTime() > windowEnd.getTime());
  const accepted =
    !exchangedWithinWindow && (pastWindow || Boolean(markedCurrentAt) || !exchangedAt);
  const pendingDecision = !exchangedWithinWindow && !pastWindow && !markedCurrentAt;

  return {
    exchangedWithinWindow,
    exchangedBeforeCurrent: Boolean(row.exchanged_before_current),
    pastWindow,
    pendingDecision,
    // For ratio: declined if exchanged within window; accepted once decided (past window or marked current) without early exchange
    declined: exchangedWithinWindow,
    accepted: !exchangedWithinWindow && (pastWindow || Boolean(markedCurrentAt)),
    pending: pendingDecision,
  };
}

function emptyProviderMetrics(providerUserId, providerName = null) {
  return {
    providerUserId,
    providerName,
    assignedCount: 0,
    acceptedCount: 0,
    declinedCount: 0,
    pendingCount: 0,
    exchangedBeforeCurrentCount: 0,
    acceptanceRatio: null,
    acceptanceLabel: 'No office referrals yet',
    windowDays: WINDOW_DAYS,
  };
}

function summarizeEvents(events, { providerUserId, providerName, windowDays }) {
  const metrics = emptyProviderMetrics(providerUserId, providerName);
  metrics.windowDays = windowDays;
  for (const ev of events) {
    const c = classifyEvent(ev, windowDays);
    metrics.assignedCount += 1;
    if (c.declined) metrics.declinedCount += 1;
    else if (c.accepted) metrics.acceptedCount += 1;
    else metrics.pendingCount += 1;
    if (c.exchangedBeforeCurrent) metrics.exchangedBeforeCurrentCount += 1;
  }
  const decided = metrics.acceptedCount + metrics.declinedCount;
  metrics.decidedCount = decided;
  metrics.acceptanceRatio =
    metrics.assignedCount > 0
      ? Math.round((metrics.acceptedCount / metrics.assignedCount) * 1000) / 1000
      : null;
  metrics.acceptanceLabel =
    metrics.assignedCount > 0
      ? `Accepted ${metrics.acceptedCount}/${metrics.assignedCount} clients referred`
      : 'No office referrals yet';
  return metrics;
}

/**
 * Agency-wide or single-provider office acceptance metrics.
 * Declined = posted to Client Exchange within `windowDays` of assignment.
 * Accepted = not declined, and either marked current or past the window.
 */
export async function getAcceptanceMetrics({
  agencyId,
  providerUserId = null,
  windowDays = WINDOW_DAYS,
} = {}) {
  const aid = safeInt(agencyId);
  if (!aid) return { windowDays: WINDOW_DAYS, providers: [], agency: emptyProviderMetrics(null) };

  const values = [aid];
  let providerFilter = '';
  if (safeInt(providerUserId)) {
    providerFilter = ' AND e.provider_user_id = ?';
    values.push(safeInt(providerUserId));
  }

  const [rows] = await pool.execute(
    `SELECT
       e.*,
       u.first_name,
       u.last_name,
       u.email,
       c.initials AS client_initials,
       c.identifier_code AS client_code,
       c.client_type
     FROM office_client_assignment_events e
     INNER JOIN users u ON u.id = e.provider_user_id
     INNER JOIN clients c ON c.id = e.client_id
     WHERE e.agency_id = ?
       AND c.client_type IN ('clinical', 'learning')
       ${providerFilter}
     ORDER BY e.assigned_at DESC`,
    values
  );

  const byProvider = new Map();
  for (const r of rows || []) {
    const pid = safeInt(r.provider_user_id);
    if (!pid) continue;
    if (!byProvider.has(pid)) {
      byProvider.set(pid, {
        providerUserId: pid,
        providerName: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Provider',
        events: [],
      });
    }
    byProvider.get(pid).events.push(r);
  }

  const providers = Array.from(byProvider.values()).map((p) => {
    const summary = summarizeEvents(p.events, {
      providerUserId: p.providerUserId,
      providerName: p.providerName,
      windowDays,
    });
    summary.events = p.events.map((ev) => {
      const c = classifyEvent(ev, windowDays);
      return {
        id: safeInt(ev.id),
        clientId: safeInt(ev.client_id),
        clientLabel: ev.client_code || ev.client_initials || `Client #${ev.client_id}`,
        assignedAt: ev.assigned_at,
        exchangedAt: ev.exchanged_at,
        markedCurrentAt: ev.marked_current_at,
        endedAt: ev.ended_at,
        outcome: c.declined ? 'declined' : c.accepted ? 'accepted' : 'pending',
        exchangedBeforeCurrent: c.exchangedBeforeCurrent,
        exchangedWithinWindow: c.exchangedWithinWindow,
      };
    });
    return summary;
  });

  providers.sort((a, b) => (b.assignedCount || 0) - (a.assignedCount || 0));

  const allEvents = rows || [];
  const agency = summarizeEvents(allEvents, {
    providerUserId: null,
    providerName: 'Agency',
    windowDays,
  });

  return { windowDays, agency, providers };
}

export { WINDOW_DAYS, isOfficeClientType, classifyEvent };
