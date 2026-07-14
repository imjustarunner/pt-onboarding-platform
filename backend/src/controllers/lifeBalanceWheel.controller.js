import pool from '../config/database.js';
import {
  getDefaultTemplate,
  createAssessment,
  getAssessmentById,
  getAssessmentByToken,
  upsertCategoryResponse,
  completeAssessment,
  addGoal,
  listAssessmentsForSubject,
  ensureAssessmentForIntakeLink
} from '../services/lifeBalanceWheel.service.js';

async function userOnAgency(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT 1 AS ok FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [Number(userId), Number(agencyId)]
  );
  return !!rows?.[0];
}

function canViewAssessment(req, assessment) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'support') return Promise.resolve(true);
  if (Number(assessment.subjectUserId) === Number(req.user?.id)) return Promise.resolve(true);
  return userOnAgency(req.user?.id, assessment.agencyId);
}

export const getDefaultTemplateHandler = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0) || null;
    const template = await getDefaultTemplate({ agencyId });
    res.json({ ok: true, template });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** Anonymous public template — platform default only; no agency/client linkage. */
export const getGuestTemplateHandler = async (req, res, next) => {
  try {
    const template = await getDefaultTemplate({ agencyId: null });
    res.json({ ok: true, template, guest: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createAssessmentHandler = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });

    const role = String(req.user?.role || '').toLowerCase();
    const onAgency = role === 'super_admin' || (await userOnAgency(req.user?.id, agencyId));
    if (!onAgency) return res.status(403).json({ error: { message: 'Access denied' } });

    let subjectUserId = req.body?.subjectUserId != null ? Number(req.body.subjectUserId) : null;
    let clientId = req.body?.clientId != null ? Number(req.body.clientId) : null;

    // Self-take
    if (req.body?.self === true || String(req.body?.subjectUserId || '') === 'me') {
      subjectUserId = Number(req.user.id);
      clientId = null;
    }

    if (!clientId && !subjectUserId) {
      return res.status(400).json({ error: { message: 'clientId or subjectUserId (or self:true) required' } });
    }

    const assessment = await createAssessment({
      agencyId,
      clientId,
      subjectUserId,
      assignedByUserId: req.user?.id || null,
      coachUserId: req.body?.coachUserId ? Number(req.body.coachUserId) : req.user?.id || null,
      intakeLinkId: req.body?.intakeLinkId || null,
      packetToken: req.body?.packetToken || null
    });

    res.status(201).json({ ok: true, assessment });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAssessmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    res.json({ ok: true, assessment });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putCategoryHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await upsertCategoryResponse({
      assessmentId: assessment.id,
      categoryKey: req.params.categoryKey,
      score: req.body?.score,
      note: req.body?.note,
      selectedOptionIds: req.body?.selectedOptionIds,
      desiredScore: req.body?.desiredScore
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const completeAssessmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await completeAssessment({
      assessmentId: assessment.id,
      priorityCategoryKeys: req.body?.priorityCategoryKeys || req.body?.priorities || []
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const addGoalHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await addGoal({
      assessmentId: assessment.id,
      categoryKey: req.body?.categoryKey,
      goalStatement: req.body?.goalStatement,
      obstacles: req.body?.obstacles,
      support: req.body?.support,
      targetDate: req.body?.targetDate,
      confidence: req.body?.confidence,
      actionSteps: req.body?.actionSteps || [],
      createdByUserId: req.user?.id || null
    });
    res.status(201).json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listSubjectAssessmentsHandler = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const type = String(req.params.type || '').toLowerCase();
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const role = String(req.user?.role || '').toLowerCase();
    let allowed = role === 'super_admin' || role === 'support';
    if (!allowed && type === 'users' && Number(req.user?.id) === id) allowed = true;
    if (!allowed && (await userOnAgency(req.user?.id, agencyId))) allowed = true;
    if (!allowed && type === 'clients' && role === 'client_guardian') {
      const [links] = await pool.execute(
        `SELECT 1 AS ok FROM client_guardians
         WHERE guardian_user_id = ? AND client_id = ? AND access_enabled = 1
         LIMIT 1`,
        [Number(req.user.id), id]
      );
      allowed = !!links?.[0];
    }
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const assessments =
      type === 'clients'
        ? await listAssessmentsForSubject({ agencyId, clientId: id })
        : await listAssessmentsForSubject({ agencyId, subjectUserId: id });

    res.json({ ok: true, assessments });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** Public token routes */
export const getPublicAssessmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    res.json({ ok: true, assessment });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putPublicCategoryHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await upsertCategoryResponse({
      assessmentId: assessment.id,
      categoryKey: req.params.categoryKey,
      score: req.body?.score,
      note: req.body?.note,
      selectedOptionIds: req.body?.selectedOptionIds,
      desiredScore: req.body?.desiredScore
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const completePublicAssessmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await completeAssessment({
      assessmentId: assessment.id,
      priorityCategoryKeys: req.body?.priorityCategoryKeys || req.body?.priorities || []
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const addPublicGoalHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await addGoal({
      assessmentId: assessment.id,
      categoryKey: req.body?.categoryKey,
      goalStatement: req.body?.goalStatement,
      obstacles: req.body?.obstacles,
      support: req.body?.support,
      targetDate: req.body?.targetDate,
      confidence: req.body?.confidence,
      actionSteps: req.body?.actionSteps || [],
      createdByUserId: null
    });
    res.status(201).json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Start or resume from an intake link public key.
 * Body/query: agencyId, clientId?, packetToken?
 */
export const startFromIntakeLinkHandler = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    if (!publicKey) return res.status(400).json({ error: { message: 'publicKey required' } });

    const [links] = await pool.execute(
      `SELECT id, agency_id, organization_id, form_type, is_active
       FROM intake_links WHERE public_key = ? LIMIT 1`,
      [publicKey]
    );
    const link = links?.[0];
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    if (String(link.form_type || '') !== 'life_balance_wheel') {
      return res.status(400).json({ error: { message: 'This link is not a Life Balance Wheel form' } });
    }

    const agencyId = Number(link.agency_id || link.organization_id || req.body?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId missing on link' } });

    const assessment = await ensureAssessmentForIntakeLink({
      agencyId,
      intakeLinkId: link.id,
      clientId: req.body?.clientId || req.query?.clientId || null,
      packetToken: req.body?.packetToken || req.query?.packetToken || null
    });

    res.json({ ok: true, assessment });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
