import pool from '../config/database.js';

/**
 * Mark every Document Status checklist item as RECEIVED for a client whose
 * intake (registration / packet / school ROI) was just completed. The intake
 * delivers all of the items that operations would otherwise have to manually
 * tick off — emailed packet, ROI, new docs, disclosure & consent, insurance
 * info, etc. — so leaving them flagged as "Needed" forces unnecessary admin
 * work and risks outreach to families who already returned everything.
 *
 * Idempotent: re-running on an already-completed client is a no-op (the
 * UPSERT updates received_at to the new timestamp but does not flip anything
 * back to "Needed"). Safe to call from inside per-child loops.
 *
 * Mirrors `applyClientRoiCompletion`'s rollup logic so `clients.paperwork_status_id`,
 * `paperwork_received_at`, and the `client_paperwork_history` audit trail
 * stay in sync with what the Document Status checklist UI shows.
 */

// The fixed checklist set defined in BULK_CLIENT_UPLOAD.md and exposed by
// `getClientDocumentStatus`. "completed" is derived from the others, not a
// row we write directly.
const ALL_INTAKE_FULFILLED_KEYS = Object.freeze([
  're_auth',
  'new_insurance',
  'insurance_payment_auth',
  'emailed_packet',
  'roi',
  'renewal',
  'new_docs',
  'disclosure_consent',
  'balance'
]);

export function getDefaultIntakeFulfilledKeys() {
  return [...ALL_INTAKE_FULFILLED_KEYS];
}

export async function applyClientIntakeCompletion({
  clientId,
  completedAt = new Date(),
  note = 'Marked received automatically after intake completion',
  actorUserId = null,
  statusKeys = ALL_INTAKE_FULFILLED_KEYS
} = {}) {
  const cid = Number(clientId || 0);
  if (!cid) return { ok: false, reason: 'missing_client_id' };

  const completedDate = completedAt instanceof Date ? completedAt : new Date(String(completedAt || ''));
  if (Number.isNaN(completedDate.getTime())) {
    return { ok: false, reason: 'invalid_completed_at' };
  }
  const effectiveDate = completedDate.toISOString().slice(0, 10);
  const actorId = Number(actorUserId || 0) || null;

  const wantedKeys = Array.from(
    new Set(
      (Array.isArray(statusKeys) ? statusKeys : ALL_INTAKE_FULFILLED_KEYS)
        .map((k) => String(k || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (!wantedKeys.length) return { ok: true, clientId: cid, marked: 0, skippedNoTable: false };

  const dbName = process.env.DB_NAME || 'onboarding_stage';
  const [tableProbe] = await pool.execute(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
    [dbName]
  );
  if (!tableProbe?.length) {
    return { ok: true, clientId: cid, marked: 0, skippedNoTable: true };
  }

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
    if (!client) {
      await connection.rollback();
      return { ok: false, reason: 'client_not_found', clientId: cid };
    }

    const [statusRows] = await connection.execute(
      `SELECT id, status_key
       FROM paperwork_statuses
       WHERE agency_id = ?`,
      [client.agency_id]
    );
    const statusByKey = new Map();
    let completedStatusId = null;
    for (const row of statusRows || []) {
      const key = String(row?.status_key || '').trim().toLowerCase();
      if (!key) continue;
      statusByKey.set(key, Number(row.id));
      if (key === 'completed') completedStatusId = Number(row.id);
    }

    const targets = wantedKeys
      .map((k) => ({ key: k, id: statusByKey.get(k) || null }))
      .filter((t) => t.id);

    let marked = 0;
    for (const t of targets) {
      await connection.execute(
        `INSERT INTO client_paperwork_items
          (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
         VALUES (?, ?, FALSE, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_needed = FALSE,
           received_at = COALESCE(received_at, VALUES(received_at)),
           received_by_user_id = COALESCE(received_by_user_id, VALUES(received_by_user_id))`,
        [cid, t.id, completedDate, actorId]
      );
      await connection.execute(
        `INSERT INTO client_paperwork_history
          (client_id, paperwork_status_id, paperwork_delivery_method_id, effective_date, roi_expires_at, note, changed_by_user_id)
         VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
        [cid, t.id, effectiveDate, note, actorId]
      );
      marked += 1;
    }

    // Recompute rollup for clients.paperwork_status_id (mirrors the
    // PUT /document-status logic and applyClientRoiCompletion).
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
      markReceivedAt = completedDate;
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

    await connection.commit();
    return {
      ok: true,
      clientId: cid,
      marked,
      neededCountAfter: neededCount,
      paperworkStatusId: nextPaperworkStatusId
    };
  } catch (error) {
    try { await connection.rollback(); } catch { /* ignore */ }
    throw error;
  } finally {
    connection.release();
  }
}

export default applyClientIntakeCompletion;
