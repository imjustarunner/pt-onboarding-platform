import pool from '../config/database.js';

class HiringResumeParse {
  static async create({
    candidateUserId,
    resumeDocId,
    method = 'pdf_text',
    status = 'pending',
    extractedText = null,
    extractedJson = null,
    errorText = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO hiring_resume_parses (
         candidate_user_id,
         resume_doc_id,
         method,
         status,
         extracted_text,
         extracted_json,
         error_text,
         created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidateUserId,
        resumeDocId,
        method,
        status,
        extractedText,
        extractedJson ? JSON.stringify(extractedJson) : null,
        errorText,
        createdByUserId
      ]
    );

    const [rows] = await pool.execute(`SELECT * FROM hiring_resume_parses WHERE id = ? LIMIT 1`, [result.insertId]);
    return rows[0] || null;
  }

  static async upsertByResumeDocId({
    candidateUserId,
    resumeDocId,
    method = 'pdf_text',
    status = 'pending',
    extractedText = null,
    extractedJson = null,
    errorText = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO hiring_resume_parses (
         candidate_user_id,
         resume_doc_id,
         method,
         status,
         extracted_text,
         extracted_json,
         error_text,
         created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         candidate_user_id = VALUES(candidate_user_id),
         method = VALUES(method),
         status = VALUES(status),
         extracted_text = VALUES(extracted_text),
         extracted_json = VALUES(extracted_json),
         error_text = VALUES(error_text),
         updated_at = CURRENT_TIMESTAMP`,
      [
        candidateUserId,
        resumeDocId,
        method,
        status,
        extractedText,
        extractedJson ? JSON.stringify(extractedJson) : null,
        errorText,
        createdByUserId
      ]
    );

    const id = result.insertId;
    if (id) {
      const [rows] = await pool.execute(`SELECT * FROM hiring_resume_parses WHERE id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    }

    const [rows] = await pool.execute(
      `SELECT * FROM hiring_resume_parses WHERE resume_doc_id = ? LIMIT 1`,
      [resumeDocId]
    );
    return rows[0] || null;
  }

  static async findByResumeDocId(resumeDocId) {
    const [rows] = await pool.execute(`SELECT * FROM hiring_resume_parses WHERE resume_doc_id = ? LIMIT 1`, [resumeDocId]);
    return rows[0] || null;
  }

  static async findLatestByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_resume_parses
       WHERE candidate_user_id = ?
         AND status IN ('completed', 'no_text', 'failed')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    return rows[0] || null;
  }

  static async findLatestCompletedTextByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_resume_parses
       WHERE candidate_user_id = ?
         AND status = 'completed'
         AND extracted_text IS NOT NULL
         AND LENGTH(extracted_text) > 0
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    return rows[0] || null;
  }

  static async findLatestStructuredByCandidateUserId(candidateUserId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM hiring_resume_parses
       WHERE candidate_user_id = ?
         AND extracted_json IS NOT NULL
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    return rows[0] || null;
  }

  static async updateExtractedJsonByResumeDocId(resumeDocId, extractedJson) {
    await pool.execute(
      `UPDATE hiring_resume_parses
       SET extracted_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE resume_doc_id = ?
       LIMIT 1`,
      [extractedJson ? JSON.stringify(extractedJson) : null, resumeDocId]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM hiring_resume_parses WHERE resume_doc_id = ? LIMIT 1`,
      [resumeDocId]
    );
    return rows[0] || null;
  }
}

export default HiringResumeParse;

