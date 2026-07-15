import pool from '../config/database.js';
import {
  getDefaultTemplate,
  createAssessment,
  getAssessmentById,
  getAssessmentByToken,
  updateSelection,
  upsertValueResponse,
  completeAssessment,
  upsertCommitment,
  listAssessmentsForSubject
} from '../services/valuesAlignment.service.js';

async function userOnAgency(userId, agencyId) {
  if (!agencyId) return false;
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
  if (!assessment.agencyId) return Promise.resolve(false);
  return userOnAgency(req.user?.id, assessment.agencyId);
}

export const getGuestTemplateHandler = async (req, res, next) => {
  try {
    const template = await getDefaultTemplate({ agencyId: null });
    res.json({ ok: true, template, guest: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

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

export const createAssessmentHandler = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const role = String(req.user?.role || '').toLowerCase();
    const onAgency = role === 'super_admin' || (await userOnAgency(req.user?.id, agencyId));
    if (!onAgency) return res.status(403).json({ error: { message: 'Access denied' } });

    let subjectUserId = req.body?.subjectUserId != null ? Number(req.body.subjectUserId) : null;
    let clientId = req.body?.clientId != null ? Number(req.body.clientId) : null;
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
      coachUserId: req.body?.coachUserId ? Number(req.body.coachUserId) : req.user?.id || null
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

export const putSelectionHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await updateSelection({
      assessmentId: assessment.id,
      selectedKeys: req.body?.selectedKeys,
      rankedKeys: req.body?.rankedKeys,
      status: req.body?.status
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putValueHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await upsertValueResponse({
      assessmentId: assessment.id,
      valueKey: req.params.valueKey,
      importanceScore: req.body?.importanceScore,
      alignmentScore: req.body?.alignmentScore,
      reflectionChips: req.body?.reflectionChips,
      note: req.body?.note
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
      priorityKeys: req.body?.priorityKeys || []
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postCommitmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    if (!(await canViewAssessment(req, assessment))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await upsertCommitment({
      assessmentId: assessment.id,
      ...req.body,
      valueKey: req.body?.valueKey
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
    const type = String(req.params.type || '');
    const id = Number(req.params.id);
    const list = await listAssessmentsForSubject({
      agencyId,
      clientId: type === 'clients' ? id : null,
      subjectUserId: type === 'users' ? id : null
    });
    res.json({ ok: true, assessments: list });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

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

export const putPublicSelectionHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await updateSelection({
      assessmentId: assessment.id,
      selectedKeys: req.body?.selectedKeys,
      rankedKeys: req.body?.rankedKeys,
      status: req.body?.status
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putPublicValueHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await upsertValueResponse({
      assessmentId: assessment.id,
      valueKey: req.params.valueKey,
      importanceScore: req.body?.importanceScore,
      alignmentScore: req.body?.alignmentScore,
      reflectionChips: req.body?.reflectionChips,
      note: req.body?.note
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
      priorityKeys: req.body?.priorityKeys || []
    });
    res.json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postPublicCommitmentHandler = async (req, res, next) => {
  try {
    const assessment = await getAssessmentByToken(req.params.accessToken);
    if (!assessment) return res.status(404).json({ error: { message: 'Assessment not found' } });
    const updated = await upsertCommitment({
      assessmentId: assessment.id,
      ...req.body,
      valueKey: req.body?.valueKey
    });
    res.status(201).json({ ok: true, assessment: updated });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
