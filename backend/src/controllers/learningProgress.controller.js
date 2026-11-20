import { maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import LearningGoal from '../models/LearningGoal.model.js';
import LearningProgress from '../models/LearningProgress.model.js';
import pool from '../config/database.js';
import { assertLearningClientAccess, assertLearningWriteAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const getStudentDomainProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    const {agencyId,service}=await assertLearningClientAccess(req, clientId);
    const domains = await LearningProgress.listDomainProgress(clientId,{agencyId,providerId:service?.provider_user_id});
    res.json({ domains });
  } catch (error) {
    next(error);
  }
};

export const getStudentGoalsProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    const {agencyId,service}=await assertLearningClientAccess(req, clientId);
    const goals = await LearningGoal.listByClient(clientId,{agencyId,providerId:service?.provider_user_id});
    res.json({ goals });
  } catch (error) {
    next(error);
  }
};

export const getStudentEvidenceTimeline = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    const {agencyId,service}=await assertLearningClientAccess(req, clientId);
    const domainId = asInt(req.query.domainId);
    const limit = asInt(req.query.limit) || 100;
    const timeline = await LearningProgress.listEvidenceTimeline(clientId, { domainId, limit, agencyId, providerId:service?.provider_user_id });
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
    const {agencyId,service,services,permissions}=await assertLearningClientAccess(req, clientId);
    const limit = Math.min(Math.max(asInt(req.query.limit) || 10, 1), 50);
    const upcomingOnly = String(req.query.upcoming || '') === '1';
    const family = ['guardian','client_guardian','client'].includes(String(req.user?.role || '').toLowerCase());
    if (family && permissions?.canViewAppointments === false) return res.json({ sessions: [] });
    const enrolled = family && Boolean(service || services?.length);
    const serviceIds = (service ? [service] : services || [])
      .filter(row => row.service_kind === 'tutoring' && row.is_active && Number(row.provider_user_id) > 0)
      .map(row => Number(row.id));
    if (enrolled && !serviceIds.length) return res.json({ sessions: [] });

    const dateFilter = upcomingOnly
      ? `AND (s.status IN ('scheduled','live') OR s.status IS NULL)
         AND COALESCE(s.ends_at, s.starts_at) > UTC_TIMESTAMP()
         AND (ap.id IS NULL OR ap.status IN ('scheduled','confirmed','client_confirmed','checked_in','in_progress'))`
      : `AND s.starts_at < UTC_TIMESTAMP()`;
    const serviceFilter = enrolled
      ? `AND EXISTS (
          SELECT 1 FROM client_service_enrollments e
          WHERE e.id IN (${serviceIds.map(() => '?').join(',')}) AND e.client_id=m.client_id
            AND e.agency_id=lpc.organization_id AND e.is_active=1
            AND e.provider_user_id=ap.provider_user_id AND ap.provider_user_id=s.provider_user_id
            AND e.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(ap.learning_context_json,'$.serviceEnrollmentId')) AS UNSIGNED)
        )`
      : '';
    const orderBy = upcomingOnly ? `ORDER BY s.starts_at ASC` : `ORDER BY COALESCE(s.ends_at, s.starts_at) DESC`;

    const [rows] = await pool.query(
      `SELECT s.id, s.learning_class_id, s.title, s.status, s.mode, s.session_subtype, s.delivery_context,
              s.starts_at, s.ends_at, s.primary_assignment_id,
              s.provider_user_id, ap.id AS appointment_id, ss.subject_label,
              CAST(JSON_UNQUOTE(JSON_EXTRACT(ap.learning_context_json,'$.serviceEnrollmentId')) AS UNSIGNED) AS service_id,
              s.ai_summary_json, s.standards_context_json,
              CONCAT(u.first_name, ' ', u.last_name) AS provider_name,
              a.slug AS org_slug
         FROM learning_class_sessions s
         JOIN tutoring_session_clients m ON m.session_id=s.id AND m.client_id=?
         LEFT JOIN users u ON u.id = s.provider_user_id
         LEFT JOIN learning_program_classes lpc ON lpc.id = s.learning_class_id
         LEFT JOIN agencies a ON a.id = lpc.organization_id
         LEFT JOIN tutoring_appointment_sessions tas ON tas.session_id = s.id
         LEFT JOIN appointments ap ON ap.id = tas.appointment_id AND ap.agency_id = lpc.organization_id
         LEFT JOIN student_subjects ss ON ss.id = s.student_subject_id AND ss.client_id = m.client_id AND ss.agency_id = lpc.organization_id
        WHERE (s.session_subtype = 'tutoring' OR s.mode = 'individual') AND lpc.organization_id=? AND (? IS NULL OR s.provider_user_id=?)
          ${dateFilter}
          ${serviceFilter}
        ${orderBy}
        LIMIT ?`,
      [clientId,agencyId,service?.provider_user_id||null,service?.provider_user_id||null,...(enrolled ? serviceIds : []),limit]
    );

    const sessions = rows.map((r) => {
      const sessionId = r.id;
      const orgSlug = r.org_slug || null;
      const appointmentQuery = new URLSearchParams({ agencyId, clientId, ...(r.service_id ? { serviceId: r.service_id } : {}) });
      const sessionUrl = r.appointment_id
        ? `${orgSlug ? '/' + orgSlug : ''}/tutoring-session/appointment/${r.appointment_id}?${appointmentQuery}`
        : orgSlug
        ? `/${orgSlug}/tutoring-session/${sessionId}`
        : String(r.delivery_context || '').toLowerCase() === 'in_person'
          ? `/in-person-tutoring-session/${sessionId}`
          : `/tutoring-session/${sessionId}`;
      return {
        ...r,
        session_url: sessionUrl,
        ai_summary_json: family && r.appointment_id ? null : safeJson(maybeDecryptNotePayload(typeof r.ai_summary_json === 'object' ? JSON.stringify(r.ai_summary_json) : r.ai_summary_json)),
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
    const access=await assertLearningWriteAccess(req, payload.clientId);payload.agencyId=access.agencyId;
    for(const goalId of payload.goalIds){
      const goal=await LearningGoal.findById(goalId);
      if(!goal||Number(goal.client_id)!==payload.clientId)throw Object.assign(new Error('Choose a goal for this student.'),{status:403});
      const goalAccess=await assertLearningWriteAccess(req,payload.clientId,goal);
      if(goalAccess.agencyId!==access.agencyId)throw Object.assign(new Error('Choose a goal from this agency.'),{status:403});
    }

    const evidence = await LearningProgress.createEvidence(payload, req.user?.id);
    res.status(201).json(evidence);
  } catch (error) {
    next(error);
  }
};
