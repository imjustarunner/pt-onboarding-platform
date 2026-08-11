import pool from '../config/database.js';

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseJsonMaybe(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toJsonParam(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

class InterviewHubTemplate {
  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      is_default: Number(row.is_default) === 1,
      flow_sections_json: parseJsonMaybe(row.flow_sections_json, null),
      standard_questions_json: parseJsonMaybe(row.standard_questions_json, null),
      scorecard_criteria_json: parseJsonMaybe(row.scorecard_criteria_json, null),
      salutation_pool_json: parseJsonMaybe(row.salutation_pool_json, null),
      icebreaker_pool_json: parseJsonMaybe(row.icebreaker_pool_json, null)
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_templates WHERE id = ? LIMIT 1`,
      [parseIntParam(id)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async listByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_templates
       WHERE agency_id = ?
       ORDER BY is_default DESC, updated_at DESC, id DESC`,
      [parseIntParam(agencyId)]
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async findDefaultByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_templates
       WHERE agency_id = ? AND is_default = 1
       ORDER BY id ASC
       LIMIT 1`,
      [parseIntParam(agencyId)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async create({
    agencyId,
    name = 'Default Interview',
    isDefault = true,
    flowSectionsJson = null,
    standardQuestionsJson = null,
    scorecardCriteriaJson = null,
    salutationPoolJson = null,
    icebreakerPoolJson = null,
    candidateQuestionsPrompt = null,
    createdByUserId = null,
    updatedByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO interview_hub_templates (
        agency_id, name, is_default,
        flow_sections_json, standard_questions_json, scorecard_criteria_json,
        salutation_pool_json, icebreaker_pool_json, candidate_questions_prompt,
        created_by_user_id, updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseIntParam(agencyId),
        String(name || 'Default Interview').trim().slice(0, 255),
        isDefault ? 1 : 0,
        toJsonParam(flowSectionsJson),
        toJsonParam(standardQuestionsJson),
        toJsonParam(scorecardCriteriaJson),
        toJsonParam(salutationPoolJson),
        toJsonParam(icebreakerPoolJson),
        candidateQuestionsPrompt != null ? String(candidateQuestionsPrompt) : null,
        parseIntParam(createdByUserId),
        parseIntParam(updatedByUserId ?? createdByUserId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateById(id, patch = {}) {
    const updates = [];
    const params = [];

    if (patch.name !== undefined) {
      updates.push('name = ?');
      params.push(String(patch.name || '').trim().slice(0, 255));
    }
    if (patch.isDefault !== undefined) {
      updates.push('is_default = ?');
      params.push(patch.isDefault ? 1 : 0);
    }
    if (patch.flowSectionsJson !== undefined) {
      updates.push('flow_sections_json = ?');
      params.push(toJsonParam(patch.flowSectionsJson));
    }
    if (patch.standardQuestionsJson !== undefined) {
      updates.push('standard_questions_json = ?');
      params.push(toJsonParam(patch.standardQuestionsJson));
    }
    if (patch.scorecardCriteriaJson !== undefined) {
      updates.push('scorecard_criteria_json = ?');
      params.push(toJsonParam(patch.scorecardCriteriaJson));
    }
    if (patch.salutationPoolJson !== undefined) {
      updates.push('salutation_pool_json = ?');
      params.push(toJsonParam(patch.salutationPoolJson));
    }
    if (patch.icebreakerPoolJson !== undefined) {
      updates.push('icebreaker_pool_json = ?');
      params.push(toJsonParam(patch.icebreakerPoolJson));
    }
    if (patch.candidateQuestionsPrompt !== undefined) {
      updates.push('candidate_questions_prompt = ?');
      params.push(patch.candidateQuestionsPrompt != null ? String(patch.candidateQuestionsPrompt) : null);
    }
    if (patch.updatedByUserId !== undefined) {
      updates.push('updated_by_user_id = ?');
      params.push(parseIntParam(patch.updatedByUserId));
    }

    if (!updates.length) return this.findById(id);

    params.push(parseIntParam(id));
    await pool.execute(
      `UPDATE interview_hub_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(id);
  }
}

export default InterviewHubTemplate;
