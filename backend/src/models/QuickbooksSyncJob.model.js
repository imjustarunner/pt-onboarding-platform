import pool from '../config/database.js';

class QuickbooksSyncJob {
  static async enqueue({
    agencyId,
    entityType,
    entityId,
    operation,
    idempotencyKey,
    runAfter = null,
    payloadJson = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO quickbooks_sync_jobs
         (agency_id, entity_type, entity_id, operation, idempotency_key, run_after, payload_json)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
       ON DUPLICATE KEY UPDATE
         run_after = LEAST(COALESCE(run_after, CURRENT_TIMESTAMP), COALESCE(VALUES(run_after), CURRENT_TIMESTAMP)),
         payload_json = COALESCE(VALUES(payload_json), payload_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        entityType,
        entityId,
        operation,
        idempotencyKey,
        runAfter,
        payloadJson ? JSON.stringify(payloadJson) : null
      ]
    );
    const id = Number(result.insertId || 0);
    if (id > 0) return id;
    const [rows] = await pool.execute(`SELECT id FROM quickbooks_sync_jobs WHERE idempotency_key = ? LIMIT 1`, [idempotencyKey]);
    return Number(rows?.[0]?.id || 0) || null;
  }

  static async appendEvent({ jobId, status, requestJson = null, responseJson = null, errorMessage = null }) {
    await pool.execute(
      `INSERT INTO quickbooks_sync_events (job_id, status, request_json, response_json, error_message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        jobId,
        status,
        requestJson ? JSON.stringify(requestJson) : null,
        responseJson ? JSON.stringify(responseJson) : null,
        errorMessage ? String(errorMessage).slice(0, 65535) : null
      ]
    );
  }
}

export default QuickbooksSyncJob;
