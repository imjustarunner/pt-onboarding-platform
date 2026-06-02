import pool from '../config/database.js';

class TrainingModuleGenerationRequest {
  static async createPending({ agencyId, requestJson, createdByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO training_module_generation_requests
        (agency_id, status, request_json, created_by_user_id)
       VALUES (?, 'pending', ?, ?)`,
      [agencyId, JSON.stringify(requestJson || {}), createdByUserId || null]
    );
    return result.insertId;
  }

  static async markCompleted(id, { outputJson, model, provider, latencyMs, moduleId = null }) {
    await pool.execute(
      `UPDATE training_module_generation_requests
       SET status = 'completed', output_json = ?, model = ?, provider = ?, latency_ms = ?,
           module_id = COALESCE(?, module_id), error_message = NULL
       WHERE id = ?`,
      [
        JSON.stringify(outputJson || {}),
        model || null,
        provider || null,
        latencyMs ?? null,
        moduleId,
        id
      ]
    );
    return this.findById(id);
  }

  static async markFailed(id, errorMessage) {
    await pool.execute(
      `UPDATE training_module_generation_requests
       SET status = 'failed', error_message = ?
       WHERE id = ?`,
      [String(errorMessage || 'Generation failed').slice(0, 2000), id]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM training_module_generation_requests WHERE id = ?',
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      request_json: parseJson(row.request_json),
      output_json: parseJson(row.output_json)
    };
  }

  static async attachModule(id, moduleId) {
    await pool.execute(
      'UPDATE training_module_generation_requests SET module_id = ? WHERE id = ?',
      [moduleId, id]
    );
  }
}

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default TrainingModuleGenerationRequest;
