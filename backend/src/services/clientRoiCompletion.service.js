import pool from '../config/database.js';

const formatYmd = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const addDays = (value, days) => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date;
};

export async function applyClientRoiCompletion({
  clientId,
  signedAt = new Date(),
  note = 'ROI completed via digital signing link',
  actorUserId = null
}) {
  const cid = Number(clientId || 0);
  if (!cid) throw new Error('clientId is required');
  const actorId = Number(actorUserId || 0) || null;
  const signedDate = signedAt instanceof Date ? signedAt : new Date(String(signedAt || ''));
  if (Number.isNaN(signedDate.getTime())) {
    throw new Error('signedAt is invalid');
  }
  const roiExpiresAt = addDays(signedDate, 365);
  const effectiveDate = formatYmd(signedDate);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [clientRows] = await connection.execute(
      `SELECT id, agency_id, paperwork_status_id, paperwork_received_at
       FROM clients
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [cid]
    );
    const client = clientRows?.[0] || null;
    if (!client) throw new Error('Client not found');

    let roiStatusId = null;
    let completedStatusId = null;
    const [statusRows] = await connection.execute(
      `SELECT id, status_key
       FROM paperwork_statuses
       WHERE agency_id = ?`,
      [client.agency_id]
    );
    for (const row of statusRows || []) {
      const key = String(row?.status_key || '').trim().toLowerCase();
      if (key === 'roi') roiStatusId = Number(row.id);
      if (key === 'completed') completedStatusId = Number(row.id);
    }

    await connection.execute(
      `UPDATE clients
       SET roi_expires_at = ?,
           updated_by_user_id = ?,
           last_activity_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [roiExpiresAt, actorId, cid]
    );

    if (roiStatusId) {
      await connection.execute(
        `INSERT INTO client_paperwork_items
          (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
         VALUES (?, ?, FALSE, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_needed = VALUES(is_needed),
           received_at = VALUES(received_at),
           received_by_user_id = VALUES(received_by_user_id)`,
        [cid, roiStatusId, signedDate, actorId]
      );

      await connection.execute(
        `INSERT INTO client_paperwork_history
          (client_id, paperwork_status_id, paperwork_delivery_method_id, effective_date, roi_expires_at, note, changed_by_user_id)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        [cid, roiStatusId, effectiveDate, roiExpiresAt, note, actorId]
      );

      const [neededRows] = await connection.execute(
        `SELECT COUNT(*) AS cnt,
                MIN(paperwork_status_id) AS single_id
         FROM client_paperwork_items
         WHERE client_id = ?
           AND is_needed = 1`,
        [cid]
      );
      const neededCount = Number(neededRows?.[0]?.cnt || 0);
      const singleId = neededRows?.[0]?.single_id ? Number(neededRows[0].single_id) : null;
      let nextPaperworkStatusId = client.paperwork_status_id ? Number(client.paperwork_status_id) : null;
      let markReceivedAt = null;
      if (neededCount === 0) {
        nextPaperworkStatusId = completedStatusId || nextPaperworkStatusId;
        markReceivedAt = signedDate;
      } else if (neededCount === 1 && singleId) {
        nextPaperworkStatusId = singleId;
      } else if (neededCount > 1) {
        nextPaperworkStatusId = null;
      }

      await connection.execute(
        `UPDATE clients
         SET paperwork_status_id = ?,
             paperwork_received_at = CASE
               WHEN ? IS NULL THEN paperwork_received_at
               ELSE COALESCE(paperwork_received_at, ?)
             END,
             updated_by_user_id = ?,
             last_activity_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextPaperworkStatusId, markReceivedAt, markReceivedAt, actorId, cid]
      );
    }

    await connection.commit();
    return {
      ok: true,
      clientId: cid,
      roiExpiresAt,
      paperworkStatusId: roiStatusId
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    connection.release();
  }
}

export default applyClientRoiCompletion;
