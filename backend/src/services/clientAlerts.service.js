import pool from '../config/database.js';

const ALERT_COLUMNS = `
  a.id, a.client_id, a.body, a.created_by_user_id, a.assignment_id, a.created_at,
  TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS author_name
`;

export async function saveClientAlert(db, { clientId, body, createdByUserId, assignmentId = null } = {}) {
  const text = String(body || '').trim();
  if (!text || !clientId || !createdByUserId) return null;
  const executor = db || pool;
  const [result] = await executor.execute(
    `INSERT INTO client_alerts (client_id, body, created_by_user_id, assignment_id)
     VALUES (?, ?, ?, ?)`,
    [clientId, text, createdByUserId, assignmentId || null]
  );
  return {
    id: Number(result?.insertId || 0),
    clientId: Number(clientId),
    body: text,
    createdByUserId: Number(createdByUserId),
    assignmentId: assignmentId ? Number(assignmentId) : null
  };
}

export async function listClientAlerts(db, { clientId } = {}) {
  const executor = db || pool;
  const [rows] = await executor.execute(
    `SELECT ${ALERT_COLUMNS}
     FROM client_alerts a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     WHERE a.client_id = ?
     ORDER BY a.id DESC`,
    [clientId]
  );
  return rows || [];
}

export async function listPendingClientAlerts(db, { clientId, userId } = {}) {
  const executor = db || pool;
  const [rows] = await executor.execute(
    `SELECT ${ALERT_COLUMNS}
     FROM client_alerts a
     LEFT JOIN users u ON u.id = a.created_by_user_id
     LEFT JOIN client_alert_dismissals d ON d.alert_id = a.id AND d.user_id = ?
     WHERE a.client_id = ? AND d.alert_id IS NULL
     ORDER BY a.id DESC`,
    [userId, clientId]
  );
  return rows || [];
}

export async function dismissClientAlert(db, { clientId, alertId, userId } = {}) {
  const executor = db || pool;
  const [rows] = await executor.execute(
    `SELECT id FROM client_alerts WHERE id = ? AND client_id = ? LIMIT 1`,
    [alertId, clientId]
  );
  if (!rows?.[0]) return { ok: false, status: 404, message: 'Client alert not found' };
  try {
    await executor.execute(
      `INSERT INTO client_alert_dismissals (alert_id, user_id) VALUES (?, ?)`,
      [alertId, userId]
    );
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
  }
  return { ok: true };
}

/** The assignee email for a client assignment. School-day assignment does not use this. */
export async function notifyAssigneeClientAlert({
  providerUserId,
  clientId,
  clientName,
  placeName,
  serviceDay,
  agencyId,
  actorUserId,
  clientAlert
} = {}) {
  const text = String(clientAlert || '').trim();
  const assigneeId = Number(providerUserId || 0);
  const id = Number(clientId || 0);
  if (!assigneeId || !id || !text) return null;
  const Notification = (await import('../models/Notification.model.js')).default;
  const NotificationDispatcherService = (await import('./notificationDispatcher.service.js')).default;
  const who = String(clientName || '').trim() || `Client #${id}`;
  const where = String(placeName || '').trim();
  const dayLabel = serviceDay ? ` (${serviceDay})` : '';
  const notification = await Notification.create({
    type: 'client_assigned',
    severity: 'warning',
    title: 'New client assigned',
    message: `${who} was assigned to you${where ? ` at ${where}` : ''}${dayLabel}.`,
    audienceJson: {
      schoolName: where || null,
      serviceDay: serviceDay || null,
      deferEmailFollowup: true,
      clientAlert: text
    },
    userId: assigneeId,
    agencyId: Number(agencyId || 0) || null,
    relatedEntityType: 'client',
    relatedEntityId: id,
    actorUserId: Number(actorUserId || 0) || null
  });
  await NotificationDispatcherService.dispatchForNotification(notification, {
    context: { severity: 'warning' }
  }).catch(() => {});
  return notification;
}

export async function findProviderAssignmentId(db, { clientId, organizationId, providerUserId, serviceDay = null } = {}) {
  const executor = db || pool;
  const params = [clientId, providerUserId];
  let orgSql = '';
  if (organizationId) {
    orgSql = ' AND organization_id = ?';
    params.push(organizationId);
  }
  params.push(serviceDay);
  const [rows] = await executor.execute(
    `SELECT id
     FROM client_provider_assignments
     WHERE client_id = ? AND provider_user_id = ?${orgSql}
       AND (service_day <=> ?)
     ORDER BY is_active DESC, id DESC
     LIMIT 1`,
    params
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}
