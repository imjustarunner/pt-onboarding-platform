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

class InterviewHubJobQuestionSet {
  static hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      agency_id: Number(row.agency_id),
      job_description_id: row.job_description_id != null ? Number(row.job_description_id) : null,
      is_active: Number(row.is_active) === 1,
      questions_json: parseJsonMaybe(row.questions_json, []),
      scorecard_criteria_json: parseJsonMaybe(row.scorecard_criteria_json, null)
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_job_question_sets WHERE id = ? LIMIT 1`,
      [parseIntParam(id)]
    );
    return this.hydrate(rows[0] || null);
  }

  static async listByAgencyId(agencyId, { jobDescriptionId = null, includeInactive = false, limit = 200 } = {}) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const clauses = ['agency_id = ?'];
    const params = [parseIntParam(agencyId)];
    if (jobDescriptionId != null) {
      clauses.push('(job_description_id = ? OR job_description_id IS NULL)');
      params.push(parseIntParam(jobDescriptionId));
    }
    if (!includeInactive) {
      clauses.push('is_active = 1');
    }
    const [rows] = await pool.execute(
      `SELECT * FROM interview_hub_job_question_sets
       WHERE ${clauses.join(' AND ')}
       ORDER BY updated_at DESC, id DESC
       LIMIT ${lim}`,
      params
    );
    return (rows || []).map((r) => this.hydrate(r));
  }

  static async findDefaultForJob(agencyId, jobDescriptionId, executor = pool) {
    const [rows]=await executor.execute(`SELECT questions.* FROM interview_hub_job_question_sets questions
      JOIN hiring_job_descriptions job ON job.id=questions.job_description_id AND job.agency_id=questions.agency_id
      WHERE questions.agency_id=? AND questions.job_description_id=? AND questions.is_active=1
        AND questions.id=job.interview_question_set_id
      ORDER BY questions.updated_at DESC,questions.id DESC LIMIT 1`,[parseIntParam(agencyId),parseIntParam(jobDescriptionId)]);
    return this.hydrate(rows[0] || null);
  }

  static async saveDefaultForJob({agencyId,jobDescriptionId,title,questionsJson,scorecardCriteriaJson=null,createdByUserId=null,onlyIfMissing=false,executor=null}) {
    const conn=executor || await pool.getConnection();
    try {
      if(!executor)await conn.beginTransaction();
      const [[job]]=await conn.execute('SELECT id FROM hiring_job_descriptions WHERE id=? AND agency_id=? FOR UPDATE',[jobDescriptionId,agencyId]);
      if(!job)throw Object.assign(new Error('Job posting not found for this agency.'),{status:404});
      let set=await this.findDefaultForJob(agencyId,jobDescriptionId,conn);
      if(!set) {
        const [created]=await conn.execute(`INSERT INTO interview_hub_job_question_sets
          (agency_id,job_description_id,title,questions_json,scorecard_criteria_json,is_active,created_by_user_id)
          VALUES(?,?,?,?,?,1,?)`,[agencyId,jobDescriptionId,String(title || 'Job interview guide').trim().slice(0,255),JSON.stringify(questionsJson),toJsonParam(scorecardCriteriaJson),createdByUserId]);
        set={id:created.insertId};
      }else if(!onlyIfMissing) {
        await conn.execute('UPDATE interview_hub_job_question_sets SET questions_json=?,scorecard_criteria_json=? WHERE id=? AND agency_id=?',
          [JSON.stringify(questionsJson),toJsonParam(scorecardCriteriaJson),set.id,agencyId]);
      }
      await conn.execute('UPDATE hiring_job_descriptions SET interview_question_set_id=? WHERE id=? AND agency_id=?',[set.id,jobDescriptionId,agencyId]);
      if(!executor)await conn.commit();
      return set.id;
    }catch(error){if(!executor)await conn.rollback();throw error;}
    finally{if(!executor)conn.release();}
  }

  static async create({
    agencyId,
    jobDescriptionId = null,
    title,
    questionsJson,
    scorecardCriteriaJson = null,
    isActive = true,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO interview_hub_job_question_sets (
        agency_id, job_description_id, title, questions_json, scorecard_criteria_json, is_active, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseIntParam(agencyId),
        jobDescriptionId != null ? parseIntParam(jobDescriptionId) : null,
        String(title || '').trim().slice(0, 255),
        toJsonParam(questionsJson ?? []),
        toJsonParam(scorecardCriteriaJson),
        isActive ? 1 : 0,
        parseIntParam(createdByUserId)
      ]
    );
    return this.findById(result.insertId);
  }

  static async updateById(id, patch = {}) {
    const updates = [];
    const params = [];

    if (patch.jobDescriptionId !== undefined) {
      updates.push('job_description_id = ?');
      params.push(patch.jobDescriptionId != null ? parseIntParam(patch.jobDescriptionId) : null);
    }
    if (patch.title !== undefined) {
      updates.push('title = ?');
      params.push(String(patch.title || '').trim().slice(0, 255));
    }
    if (patch.questionsJson !== undefined) {
      updates.push('questions_json = ?');
      params.push(toJsonParam(patch.questionsJson));
    }
    if (patch.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(patch.isActive ? 1 : 0);
    }
    if (patch.scorecardCriteriaJson !== undefined) {
      updates.push('scorecard_criteria_json = ?');
      params.push(toJsonParam(patch.scorecardCriteriaJson));
    }

    if (!updates.length) return this.findById(id);

    params.push(parseIntParam(id));
    await pool.execute(
      `UPDATE interview_hub_job_question_sets SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async deleteById(id) {
    const [result] = await pool.execute(
      `DELETE FROM interview_hub_job_question_sets WHERE id = ?`,
      [parseIntParam(id)]
    );
    return (result?.affectedRows || 0) > 0;
  }
}

export default InterviewHubJobQuestionSet;
