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

class LearningProgress {
  static async createEvidence(payload, actorUserId) {
    const {
      clientId,
      sourceType,
      sourceId = null,
      assessmentType = null,
      observedAt,
      domainId,
      subdomainId = null,
      standardId = null,
      skillId,
      scoreValue = null,
      rubricLevel = null,
      completionStatus = 'completed',
      notes = null,
      validityFlag = true,
      reliabilityFlag = true,
      confidenceScore = null,
      metadata = null,
      goalIds = []
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO learning_evidence
       (client_id, source_type, source_id, assessment_type, observed_at, domain_id, subdomain_id, standard_id, skill_id,
        score_value, rubric_level, completion_status, notes, validity_flag, reliability_flag, confidence_score,
        metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        sourceType,
        sourceId,
        assessmentType,
        observedAt || new Date(),
        domainId,
        subdomainId,
        standardId,
        skillId,
        scoreValue,
        rubricLevel,
        completionStatus,
        notes,
        validityFlag ? 1 : 0,
        reliabilityFlag ? 1 : 0,
        confidenceScore,
        metadata ? JSON.stringify(metadata) : null,
        actorUserId || null
      ]
    );

    if (Array.isArray(goalIds) && goalIds.length) {
      const links = goalIds
        .map((goalId) => [goalId, result.insertId])
        .filter(([goalId]) => Number.isInteger(Number(goalId)));
      if (links.length) {
        await pool.query(
          `INSERT IGNORE INTO learning_goal_evidence (goal_id, evidence_id) VALUES ?`,
          [links]
        );
      }
    }

    return this.findEvidenceById(result.insertId);
  }

  static async findEvidenceById(evidenceId) {
    const [rows] = await pool.execute(
      `SELECT le.*, d.title AS domain_title, sd.title AS subdomain_title,
              st.code AS standard_code, sk.title AS skill_title
       FROM learning_evidence le
       JOIN learning_standards_domains d ON d.id = le.domain_id
       LEFT JOIN learning_standards_subdomains sd ON sd.id = le.subdomain_id
       LEFT JOIN learning_standards st ON st.id = le.standard_id
       JOIN learning_skills sk ON sk.id = le.skill_id
       WHERE le.id = ?`,
      [evidenceId]
    );

    if (!rows[0]) return null;
    return {
      ...rows[0],
      metadata_json: parseJson(rows[0].metadata_json, {})
    };
  }

  static async listEvidenceTimeline(clientId, { domainId = null, limit = 100 } = {}) {
    const params = [clientId];
    let where = 'le.client_id = ?';
    if (domainId) {
      where += ' AND le.domain_id = ?';
      params.push(domainId);
    }
    params.push(Math.max(1, Math.min(Number(limit) || 100, 500)));

    const [rows] = await pool.execute(
      `SELECT le.*, d.title AS domain_title, sd.title AS subdomain_title,
              st.code AS standard_code, sk.title AS skill_title
       FROM learning_evidence le
       JOIN learning_standards_domains d ON d.id = le.domain_id
       LEFT JOIN learning_standards_subdomains sd ON sd.id = le.subdomain_id
       LEFT JOIN learning_standards st ON st.id = le.standard_id
       JOIN learning_skills sk ON sk.id = le.skill_id
       WHERE ${where}
       ORDER BY le.observed_at DESC, le.id DESC
       LIMIT ?`,
      params
    );

    return rows.map((row) => ({
      ...row,
      metadata_json: parseJson(row.metadata_json, {})
    }));
  }

  static async listDomainProgress(clientId) {
    const [rows] = await pool.execute(
      `SELECT d.id AS domain_id, d.code AS domain_code, d.title AS domain_title,
              COUNT(le.id) AS evidence_count,
              AVG(le.score_value) AS avg_score,
              SUM(CASE WHEN le.completion_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
              MAX(le.observed_at) AS latest_observed_at,
              (
                SELECT lps.mastery_estimate
                FROM learning_progress_snapshots lps
                WHERE lps.client_id = ? AND lps.domain_id = d.id
                ORDER BY lps.snapshot_at DESC
                LIMIT 1
              ) AS latest_mastery_estimate,
              (
                SELECT lps.goal_alignment_score
                FROM learning_progress_snapshots lps
                WHERE lps.client_id = ? AND lps.domain_id = d.id
                ORDER BY lps.snapshot_at DESC
                LIMIT 1
              ) AS latest_goal_alignment_score
       FROM learning_standards_domains d
       LEFT JOIN learning_evidence le ON le.domain_id = d.id AND le.client_id = ?
       WHERE d.is_active = 1
       GROUP BY d.id, d.code, d.title
       ORDER BY d.title ASC`,
      [clientId, clientId, clientId]
    );
    return rows;
  }

  static async getRecommendations(clientId) {
    const [rows] = await pool.execute(
      `SELECT d.id AS domain_id, d.title AS domain_title,
              sk.id AS skill_id, sk.title AS skill_title,
              AVG(le.score_value) AS avg_score,
              COUNT(le.id) AS evidence_count,
              MAX(le.observed_at) AS latest_observed_at
       FROM learning_evidence le
       JOIN learning_standards_domains d ON d.id = le.domain_id
       JOIN learning_skills sk ON sk.id = le.skill_id
       WHERE le.client_id = ?
       GROUP BY d.id, d.title, sk.id, sk.title
       HAVING evidence_count >= 1
       ORDER BY avg_score ASC, latest_observed_at DESC
       LIMIT 8`,
      [clientId]
    );

    return rows.map((row) => {
      const avg = Number(row.avg_score);
      let shift = 'maintain';
      if (Number.isFinite(avg)) {
        if (avg >= 85) shift = 'increase';
        else if (avg < 65) shift = 'decrease';
      }
      return {
        ...row,
        recommended_difficulty_shift: shift,
        rationale:
          shift === 'increase'
            ? 'Recent performance is strong; increase complexity.'
            : shift === 'decrease'
              ? 'Recent performance indicates support is needed; scaffold down.'
              : 'Recent performance is stable; maintain level while reinforcing skills.'
      };
    });
  }
}

export default LearningProgress;
