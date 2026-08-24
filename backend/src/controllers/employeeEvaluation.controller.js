import User from '../models/User.model.js';
import EmployeeEvaluationTemplate from '../models/EmployeeEvaluationTemplate.model.js';
import {
  currentEvaluationPeriod,
  previewTemplatesForEmployee,
  getCycleBundle,
  createEvaluationCycle,
  linkCycleToEvent,
  saveEvaluationDraft,
  submitEvaluation,
  adminCommentOnCycle,
  reopenEvaluation,
  closeEvaluation,
  listAgencyEvaluationRoster,
  listTemplatesForJob,
  generateAndAttachTemplateForJob,
  attachTemplateToJob
} from '../services/employeeEvaluation.service.js';

function parseAgencyId(req) {
  const raw = req.query?.agencyId || req.body?.agencyId || req.user?.agencyId;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function userInAgency(userId, agencyId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

function isAdminRole(role) {
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'assistant_admin'].includes(
    String(role || '').toLowerCase()
  );
}

async function assertCanManageAgency(req, agencyId) {
  if (!agencyId) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }
  if (!isAdminRole(req.user?.role) && String(req.user?.role || '').toLowerCase() !== 'provider_plus') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const ok = await userInAgency(req.user.id, agencyId);
  if (!ok && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
    const err = new Error('Agency access denied');
    err.status = 403;
    throw err;
  }
}

async function assertCanAccessCycle(req, cycleId) {
  const bundle = await getCycleBundle(cycleId);
  if (!bundle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  const isEmployee = Number(bundle.cycle.employee_user_id) === Number(req.user.id);
  const isAdmin = isAdminRole(req.user?.role);
  if (!isEmployee && !isAdmin) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  if (isAdmin && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
    const ok = await userInAgency(req.user.id, bundle.cycle.agency_id);
    if (!ok) {
      const err = new Error('Agency access denied');
      err.status = 403;
      throw err;
    }
  }
  return bundle;
}

export const getCurrentPeriod = async (req, res, next) => {
  try {
    res.json(currentEvaluationPeriod());
  } catch (e) {
    next(e);
  }
};

export const getRoster = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await assertCanManageAgency(req, agencyId);
    const result = await listAgencyEvaluationRoster({
      agencyId,
      periodYear: req.query.periodYear,
      periodHalf: req.query.periodHalf
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getEmployeePreview = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const employeeUserId = parseId(req.params.userId);
    await assertCanManageAgency(req, agencyId);
    if (!employeeUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const result = await previewTemplatesForEmployee({ agencyId, employeeUserId });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listEmployeeCycles = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const employeeUserId = parseId(req.params.userId);
    if (!employeeUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const isSelf = Number(req.user.id) === employeeUserId;
    if (!isSelf) await assertCanManageAgency(req, agencyId);
    else if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const EmployeeEvaluationCycle = (await import('../models/EmployeeEvaluationCycle.model.js')).default;
    const cycles = await EmployeeEvaluationCycle.listForEmployee({ agencyId, employeeUserId });
    const bundles = [];
    for (const c of cycles) {
      bundles.push(await getCycleBundle(c.id));
    }
    res.json({ cycles: bundles });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getMyCycles = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    req.params.userId = String(req.user.id);
    return listEmployeeCycles(req, res, next);
  } catch (e) {
    next(e);
  }
};

export const getCycle = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const bundle = await assertCanAccessCycle(req, cycleId);
    res.json(bundle);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getCycleByEvent = async (req, res, next) => {
  try {
    const eventId = parseId(req.params.eventId);
    const EmployeeEvaluationCycle = (await import('../models/EmployeeEvaluationCycle.model.js')).default;
    const cycle = await EmployeeEvaluationCycle.findByEventId(eventId);
    if (!cycle) return res.status(404).json({ error: { message: 'No evaluation linked to this event' } });
    const bundle = await assertCanAccessCycle(req, cycle.id);
    res.json(bundle);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postCreateCycle = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await assertCanManageAgency(req, agencyId);
    const employeeUserId = parseId(req.body?.employeeUserId);
    const periodYear = parseInt(req.body?.periodYear, 10);
    const periodHalf = String(req.body?.periodHalf || '').toUpperCase();
    if (!employeeUserId || !periodYear || !['H1', 'H2'].includes(periodHalf)) {
      return res.status(400).json({ error: { message: 'employeeUserId, periodYear, and periodHalf (H1|H2) are required' } });
    }
    const bundle = await createEvaluationCycle({
      agencyId,
      employeeUserId,
      initiatedByUserId: req.user.id,
      periodYear,
      periodHalf,
      scheduleEventId: req.body?.scheduleEventId ? parseId(req.body.scheduleEventId) : null,
      dueAt: req.body?.dueAt || null
    });
    res.status(201).json(bundle);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message, cycleId: e.cycleId } });
    next(e);
  }
};

export const postLinkEvent = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const scheduleEventId = parseId(req.body?.scheduleEventId);
    await assertCanManageAgency(req, parseAgencyId(req) || (await getCycleBundle(cycleId))?.cycle?.agency_id);
    if (!scheduleEventId) return res.status(400).json({ error: { message: 'scheduleEventId is required' } });
    const bundle = await linkCycleToEvent({
      cycleId,
      scheduleEventId,
      actorUserId: req.user.id
    });
    res.json(bundle);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putSaveDraft = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const bundle = await assertCanAccessCycle(req, cycleId);
    const isEmployee = Number(bundle.cycle.employee_user_id) === Number(req.user.id);
    if (!isEmployee) return res.status(403).json({ error: { message: 'Only the employee can edit ratings' } });
    const result = await saveEvaluationDraft({
      cycleId,
      actorUserId: req.user.id,
      responses: req.body?.responses || []
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postSubmit = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    await assertCanAccessCycle(req, cycleId);
    const result = await submitEvaluation({
      cycleId,
      actorUserId: req.user.id,
      responses: req.body?.responses || []
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postAdminComment = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const bundle = await assertCanAccessCycle(req, cycleId);
    await assertCanManageAgency(req, bundle.cycle.agency_id);
    const result = await adminCommentOnCycle({
      cycleId,
      actorUserId: req.user.id,
      adminComments: String(req.body?.adminComments || ''),
      markReviewed: req.body?.markReviewed !== false
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postReopen = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const bundle = await assertCanAccessCycle(req, cycleId);
    await assertCanManageAgency(req, bundle.cycle.agency_id);
    const result = await reopenEvaluation({ cycleId, actorUserId: req.user.id });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postClose = async (req, res, next) => {
  try {
    const cycleId = parseId(req.params.cycleId);
    const bundle = await assertCanAccessCycle(req, cycleId);
    await assertCanManageAgency(req, bundle.cycle.agency_id);
    const result = await closeEvaluation({ cycleId, actorUserId: req.user.id });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listJobTemplates = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const jobDescriptionId = parseId(req.params.jobDescriptionId);
    await assertCanManageAgency(req, agencyId);
    const templates = await listTemplatesForJob({ agencyId, jobDescriptionId });
    res.json({ templates });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postGenerateJobTemplate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const jobDescriptionId = parseId(req.params.jobDescriptionId);
    await assertCanManageAgency(req, agencyId);
    const templates = await generateAndAttachTemplateForJob({
      agencyId,
      jobDescriptionId,
      createdByUserId: req.user.id
    });
    res.status(201).json({ templates });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postAttachJobTemplate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const jobDescriptionId = parseId(req.params.jobDescriptionId);
    const templateId = parseId(req.body?.templateId);
    await assertCanManageAgency(req, agencyId);
    if (!templateId) return res.status(400).json({ error: { message: 'templateId is required' } });
    const templates = await attachTemplateToJob({ agencyId, jobDescriptionId, templateId });
    res.json({ templates });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAgencyTemplates = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await assertCanManageAgency(req, agencyId);
    const templates = await EmployeeEvaluationTemplate.listForAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    res.json({ templates });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
