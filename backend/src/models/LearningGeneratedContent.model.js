import pool from '../config/database.js';

const parseJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

class LearningGeneratedContent {
  static async createRequest(payload, actorUserId) {
    const {
      clientId,
      generationPath,
      domainId,
      subdomainId = null,
      standardId = null,
      skillId,
      targetGradeLevel = null,
      theme = null,
      sourceDocumentUrl = null,
      requestPayload = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO learning_generated_content
       (client_id, generation_path, domain_id, subdomain_id, standard_id, skill_id,
        target_grade_level, theme, source_document_url, request_payload_json, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        clientId,
        generationPath,
        domainId,
        subdomainId,
        standardId,
        skillId,
        targetGradeLevel,
        theme,
        sourceDocumentUrl,
        requestPayload ? JSON.stringify(requestPayload) : null,
        actorUserId || null
      ]
    );

    return result.insertId;
  }

  static async markCompleted(id, outputPayload) {
    await pool.execute(
      `UPDATE learning_generated_content
       SET status = 'completed', output_payload_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(outputPayload || {}), id]
    );
    return this.findById(id);
  }

  static async markFailed(id, message) {
    await pool.execute(
      `UPDATE learning_generated_content
       SET status = 'failed', output_payload_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify({ error: message || 'Generation failed' }), id]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM learning_generated_content WHERE id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      ...row,
      request_payload_json: parseJson(row.request_payload_json, {}),
      output_payload_json: parseJson(row.output_payload_json, {})
    };
  }
}

export default LearningGeneratedContent;
