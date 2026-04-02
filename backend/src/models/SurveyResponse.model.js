import pool from '../config/database.js';
import { parseJsonMaybe } from '../services/companyEvents.service.js';

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeResponseData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function computeSurveyScores(questions, responseData) {
  const qs = Array.isArray(questions) ? questions : [];
  const answers = normalizeResponseData(responseData);
  let total = 0;
  let hasAnyScore = false;
  const categoryScores = {};

  for (const q of qs) {
    if (!q || typeof q !== 'object') continue;
    const qid = String(q.id || '').trim();
    if (!qid) continue;
    const scoring = q.scoring && typeof q.scoring === 'object' ? q.scoring : null;
    if (!scoring?.enabled) continue;
    const raw = answers[qid];
    const value = raw && typeof raw === 'object' && 'answer' in raw ? raw.answer : raw;

    let points = null;
    if (scoring.optionScores && typeof scoring.optionScores === 'object') {
      const key = String(value ?? '').trim();
      if (Object.prototype.hasOwnProperty.call(scoring.optionScores, key)) {
        points = parseNumber(scoring.optionScores[key]);
      }
    }
    if (points == null) {
      points = parseNumber(value);
    }
    if (points == null) continue;
    hasAnyScore = true;
    total += points;

    const category = String(q.category || '').trim().toLowerCase();
    if (category) {
      categoryScores[category] = (Number(categoryScores[category] || 0) + points);
    }
  }

  return {
    totalScore: hasAnyScore ? total : null,
    categoryScores: Object.keys(categoryScores).length ? categoryScores : null
  };
}

class SurveyResponse {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      response_data_json: parseJsonMaybe(row.response_data_json) || {},
      category_scores_json: parseJsonMaybe(row.category_scores_json) || null
    };
  }

  static async create(data) {
    const {
      surveyId,
      surveyPushId = null,
      respondentUserId = null,
      clientId = null,
      companyEventSessionSurveyId = null,
      responseData = {},
      totalScore = null,
      categoryScores = null,
      submittedAt = new Date()
    } = data || {};
    const [result] = await pool.execute(
      `INSERT INTO survey_responses
       (survey_id, survey_push_id, respondent_user_id, client_id, company_event_session_survey_id, response_data_json, total_score, category_scores_json, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(surveyId),
        surveyPushId ? Number(surveyPushId) : null,
        respondentUserId ? Number(respondentUserId) : null,
        clientId ? Number(clientId) : null,
        companyEventSessionSurveyId ? Number(companyEventSessionSurveyId) : null,
        JSON.stringify(responseData || {}),
        totalScore != null ? Number(totalScore) : null,
        categoryScores ? JSON.stringify(categoryScores) : null,
        submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM survey_responses WHERE id = ? LIMIT 1', [Number(id)]);
    return this.normalize(rows?.[0] || null);
  }

  static async listBySurvey(surveyId) {
    const [rows] = await pool.execute(
      `SELECT sr.*, u.first_name, u.last_name, u.email
       FROM survey_responses sr
       LEFT JOIN users u ON u.id = sr.respondent_user_id
       WHERE sr.survey_id = ?
       ORDER BY sr.submitted_at DESC, sr.id DESC`,
      [Number(surveyId)]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async listByClient(clientId) {
    const [rows] = await pool.execute(
      `SELECT sr.*, s.title AS survey_title, s.is_scored
       FROM survey_responses sr
       JOIN surveys s ON s.id = sr.survey_id
       WHERE sr.client_id = ?
       ORDER BY sr.submitted_at DESC, sr.id DESC`,
      [Number(clientId)]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async listByClientAndSurvey(clientId, surveyId) {
    const [rows] = await pool.execute(
      `SELECT sr.*
       FROM survey_responses sr
       WHERE sr.client_id = ? AND sr.survey_id = ?
       ORDER BY sr.submitted_at ASC, sr.id ASC`,
      [Number(clientId), Number(surveyId)]
    );
    return rows.map((r) => this.normalize(r));
  }
}

export default SurveyResponse;
