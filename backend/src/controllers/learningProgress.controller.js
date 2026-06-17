import LearningGoal from '../models/LearningGoal.model.js';
import LearningProgress from '../models/LearningProgress.model.js';
import pool from '../config/database.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const getStudentDomainProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const domains = await LearningProgress.listDomainProgress(clientId);
    res.json({ domains });
  } catch (error) {
    next(error);
  }
};

export const getStudentGoalsProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const goals = await LearningGoal.listByClient(clientId);
    res.json({ goals });
  } catch (error) {
    next(error);
  }
};

export const getStudentEvidenceTimeline = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const domainId = asInt(req.query.domainId);
    const limit = asInt(req.query.limit) || 100;
    const timeline = await LearningProgress.listEvidenceTimeline(clientId, { domainId, limit });
    res.json({ timeline });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns recent virtual tutoring sessions for the given client. A tutoring
 * session is one on learning_class_sessions with session_subtype='tutoring' OR
 * (legacy) mode='individual'. The AI summary, standards context, and primary
 * assignment are returned so the guardian portal can render recap cards and
 * branded homework links.
 */
export const getStudentTutoringSessions = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const limit = Math.min(Math.max(asInt(req.query.limit) || 10, 1), 50);
    // ?upcoming=1 returns scheduled future sessions; default returns past completed sessions
    const upcomingOnly = String(req.query.upcoming || '') === '1';

    const dateFilter = upcomingOnly
      ? `AND (s.status IN ('scheduled','live') OR (s.status IS NULL AND s.starts_at > NOW()))`
      : `AND s.starts_at < NOW()`;

    const orderBy = upcomingOnly ? `ORDER BY s.starts_at ASC` : `ORDER BY COALESCE(s.ends_at, s.starts_at) DESC`;

    const [rows] = await pool.query(
      `SELECT s.id, s.learning_class_id, s.title, s.status, s.mode, s.session_subtype, s.delivery_context,
              s.starts_at, s.ends_at, s.primary_assignment_id,
              s.provider_user_id,
              s.ai_summary_json, s.standards_context_json,
              CONCAT(u.first_name, ' ', u.last_name) AS provider_name,
              a.slug AS org_slug
         FROM learning_class_sessions s
         JOIN learning_class_client_memberships m
           ON m.learning_class_id = s.learning_class_id
          AND m.client_id = ?
          AND m.membership_status IN ('active','completed')
         LEFT JOIN users u ON u.id = s.provider_user_id
         LEFT JOIN learning_program_classes lpc ON lpc.id = s.learning_class_id
         LEFT JOIN agencies a ON a.id = lpc.organization_id
        WHERE (s.session_subtype = 'tutoring' OR s.mode = 'individual')
          ${dateFilter}
        ${orderBy}
        LIMIT ?`,
      [clientId, limit]
    );

    const sessions = rows.map((r) => {
      const sessionId = r.id;
      const orgSlug = r.org_slug || null;
      const sessionUrl = orgSlug
        ? `/${orgSlug}/tutoring-session/${sessionId}`
        : String(r.delivery_context || '').toLowerCase() === 'in_person'
          ? `/in-person-tutoring-session/${sessionId}`
          : `/tutoring-session/${sessionId}`;
      return {
        ...r,
        session_url: sessionUrl,
        ai_summary_json: safeJson(r.ai_summary_json),
        standards_context_json: safeJson(r.standards_context_json)
      };
    });

    res.json({ sessions });
  } catch (error) {
    next(error);
  }
};

function safeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

export const createLearningEvidence = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      clientId: asInt(req.body.clientId),
      domainId: asInt(req.body.domainId),
      subdomainId: asInt(req.body.subdomainId),
      standardId: asInt(req.body.standardId),
      skillId: asInt(req.body.skillId),
      sourceId: req.body.sourceId == null ? null : Number(req.body.sourceId),
      goalIds: Array.isArray(req.body.goalIds) ? req.body.goalIds.map((v) => asInt(v)).filter(Boolean) : []
    };

    if (!payload.clientId || !payload.domainId || !payload.skillId || !payload.sourceType) {
      return res.status(400).json({
        error: { message: 'clientId, sourceType, domainId, and skillId are required' }
      });
    }
    await assertLearningClientAccess(req, payload.clientId);

    const evidence = await LearningProgress.createEvidence(payload, req.user?.id);
    res.status(201).json(evidence);
  } catch (error) {
    next(error);
  }
};
