/**
 * Semiannual employee evaluation cycles, templates, and self-assessment responses.
 */
import pool from '../config/database.js';
import EmployeeEvaluationTemplate from '../models/EmployeeEvaluationTemplate.model.js';
import HiringJobEvaluationTemplate from '../models/HiringJobEvaluationTemplate.model.js';
import EmployeeEvaluationCycle from '../models/EmployeeEvaluationCycle.model.js';
import EmployeeEvaluationResponse from '../models/EmployeeEvaluationResponse.model.js';
import EmployeeEvaluationActivity from '../models/EmployeeEvaluationActivity.model.js';
import Task from '../models/Task.model.js';
import {
  generateRubricFromJobDescription,
  templateSlugForJobDescription
} from './jobDescriptionEvaluationTemplate.service.js';

export function currentEvaluationPeriod(asOf = new Date()) {
  const d = asOf instanceof Date ? asOf : new Date(asOf);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return {
    periodYear: year,
    periodHalf: month <= 6 ? 'H1' : 'H2',
    label: `${month <= 6 ? 'H1' : 'H2'} ${year}`
  };
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadEmployeeJobDescription(employeeUserId) {
  const [rows] = await pool.execute(
    `SELECT hp.job_description_id, hp.applied_role,
            jd.id, jd.title, jd.description_text, jd.description_sections_json, jd.agency_id,
            u.has_supervisor_privileges, u.role, u.title AS user_title,
            u.first_name, u.last_name
     FROM users u
     LEFT JOIN hiring_profiles hp ON hp.id = (
       SELECT hp2.id FROM hiring_profiles hp2
       WHERE hp2.candidate_user_id = u.id
       ORDER BY hp2.updated_at DESC, hp2.id DESC
       LIMIT 1
     )
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
     WHERE u.id = ?
     LIMIT 1`,
    [employeeUserId]
  );
  return rows?.[0] || null;
}

async function resolveTemplatesForEmployee({ agencyId, employeeUserId }) {
  const profile = await loadEmployeeJobDescription(employeeUserId);
  const isSupervisor =
    profile?.has_supervisor_privileges === 1
    || profile?.has_supervisor_privileges === true
    || String(profile?.role || '').toLowerCase() === 'supervisor';

  const templates = [];
  if (profile?.id) {
    const attached = await HiringJobEvaluationTemplate.listForJob(profile.id);
    for (const row of attached || []) {
      templates.push({
        templateId: row.template_id,
        slug: row.slug,
        name: row.template_name,
        version: row.version,
        isSupervisorRubric: !!(row.is_supervisor_rubric === 1 || row.is_supervisor_rubric === true),
        rubric: parseJson(row.rubric_json, {})
      });
    }
  }

  if (!templates.length) {
    // Fallback: generate ephemeral rubric from JD text or user title.
    const jd = profile?.id
      ? {
          id: profile.id,
          title: profile.title || profile.applied_role || profile.user_title || 'Employee',
          description_text: profile.description_text,
          description_sections_json: profile.description_sections_json
        }
      : {
          id: 0,
          title: profile?.user_title || profile?.applied_role || 'Employee',
          description_text: '',
          description_sections_json: null
        };
    const rubric = generateRubricFromJobDescription(jd);
    const slug = templateSlugForJobDescription(jd);
    let tpl = await EmployeeEvaluationTemplate.findLatestBySlug(agencyId, slug);
    if (!tpl) {
      tpl = await EmployeeEvaluationTemplate.createVersion({
        agencyId,
        slug,
        name: rubric.title,
        rubricJson: rubric,
        isSupervisorRubric: false
      });
    }
    templates.push({
      templateId: tpl.id,
      slug: tpl.slug,
      name: tpl.name,
      version: tpl.version,
      isSupervisorRubric: false,
      rubric: tpl.rubric_json
    });
  }

  if (isSupervisor) {
    const already = templates.some((t) => t.isSupervisorRubric || t.slug === 'supervisor');
    if (!already) {
      let supervisorTpl = await EmployeeEvaluationTemplate.findLatestBySlug(agencyId, 'supervisor');
      if (!supervisorTpl) {
        const { ITSCO_EVALUATION_RUBRICS } = await import('../seeds/itscoEmployeeEvaluationRubrics.js');
        const def = ITSCO_EVALUATION_RUBRICS.supervisor;
        supervisorTpl = await EmployeeEvaluationTemplate.createVersion({
          agencyId,
          slug: def.slug,
          name: def.name,
          rubricJson: def.rubric,
          isSupervisorRubric: true
        });
      }
      templates.push({
        templateId: supervisorTpl.id,
        slug: supervisorTpl.slug,
        name: supervisorTpl.name,
        version: supervisorTpl.version,
        isSupervisorRubric: true,
        rubric: supervisorTpl.rubric_json
      });
    }
  }

  return {
    profile,
    templates,
    jobDescriptionId: profile?.id || null,
    jobTitle: profile?.title || profile?.applied_role || profile?.user_title || null,
    isSupervisor
  };
}

export async function previewTemplatesForEmployee({ agencyId, employeeUserId }) {
  return resolveTemplatesForEmployee({ agencyId, employeeUserId });
}

export async function getCycleBundle(cycleId) {
  const cycle = await EmployeeEvaluationCycle.findById(cycleId);
  if (!cycle) return null;
  const responses = await EmployeeEvaluationResponse.listForCycle(cycleId);
  const activity = await EmployeeEvaluationActivity.listForCycle(cycleId);
  return { cycle, responses, activity };
}

export async function createEvaluationCycle({
  agencyId,
  employeeUserId,
  initiatedByUserId,
  periodYear,
  periodHalf,
  scheduleEventId = null,
  dueAt = null
}) {
  const existing = await EmployeeEvaluationCycle.findByEmployeePeriod({
    agencyId,
    employeeUserId,
    periodYear,
    periodHalf
  });
  if (existing && existing.status !== 'cancelled') {
    const err = new Error(`Evaluation cycle for ${periodHalf} ${periodYear} already exists`);
    err.status = 409;
    err.cycleId = existing.id;
    throw err;
  }

  const resolved = await resolveTemplatesForEmployee({ agencyId, employeeUserId });
  const periodLabel = `${periodHalf} ${periodYear}`;

  const task = await Task.create({
    taskType: 'custom',
    title: `Complete ${periodLabel} self-evaluation`,
    description:
      'Complete your employee self-assessment rubric. You can edit it from My Account or during your evaluation meeting.',
    assignedByUserId: initiatedByUserId,
    assignedToUserId: employeeUserId,
    assignedToAgencyId: agencyId,
    urgency: 'high',
    isRequired: true,
    metadata: {
      evaluationCycle: true,
      periodYear,
      periodHalf,
      scheduleEventId: scheduleEventId || null
    }
  });

  const cycle = await EmployeeEvaluationCycle.create({
    agencyId,
    employeeUserId,
    initiatedByUserId,
    periodYear,
    periodHalf,
    status: 'scheduled',
    scheduleEventId,
    jobDescriptionId: resolved.jobDescriptionId,
    jobTitleSnapshot: resolved.jobTitle,
    templateSnapshot: resolved.templates,
    dueAt,
    assignedTaskId: task.id
  });

  for (const tpl of resolved.templates) {
    await EmployeeEvaluationResponse.create({
      cycleId: cycle.id,
      templateId: tpl.templateId,
      templateSlug: tpl.slug,
      templateName: tpl.name,
      isSupervisorRubric: tpl.isSupervisorRubric,
      rubricSnapshot: tpl.rubric,
      ratings: {},
      sectionActionItems: {},
      reflection: {},
      status: 'draft'
    });
  }

  await EmployeeEvaluationActivity.create({
    cycleId: cycle.id,
    actorUserId: initiatedByUserId,
    eventType: 'assigned',
    detail: {
      periodYear,
      periodHalf,
      scheduleEventId,
      taskId: task.id,
      templateCount: resolved.templates.length
    }
  });

  // Link task metadata with cycle id
  try {
    await pool.execute(
      `UPDATE tasks SET metadata = JSON_SET(COALESCE(metadata, '{}'), '$.evaluationCycleId', ?) WHERE id = ?`,
      [cycle.id, task.id]
    );
  } catch {
    /* ignore */
  }

  return getCycleBundle(cycle.id);
}

export async function linkCycleToEvent({ cycleId, scheduleEventId, actorUserId = null }) {
  const cycle = await EmployeeEvaluationCycle.update(cycleId, {
    scheduleEventId,
    status: 'scheduled'
  });
  if (cycle?.assigned_task_id) {
    try {
      await pool.execute(
        `UPDATE tasks SET metadata = JSON_SET(COALESCE(metadata, '{}'), '$.scheduleEventId', ?) WHERE id = ?`,
        [scheduleEventId, cycle.assigned_task_id]
      );
    } catch {
      /* ignore */
    }
  }
  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'linked_event',
    detail: { scheduleEventId }
  });
  return getCycleBundle(cycleId);
}

export async function saveEvaluationDraft({
  cycleId,
  actorUserId,
  responses = []
}) {
  const cycle = await EmployeeEvaluationCycle.findById(cycleId);
  if (!cycle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  if (['closed', 'cancelled'].includes(cycle.status)) {
    const err = new Error('Evaluation cycle is locked');
    err.status = 400;
    throw err;
  }
  if (cycle.status === 'submitted' || cycle.status === 'reviewed') {
    const err = new Error('Evaluation already submitted; ask an admin to reopen to edit');
    err.status = 400;
    throw err;
  }

  const existing = await EmployeeEvaluationResponse.listForCycle(cycleId);
  const byId = new Map(existing.map((r) => [Number(r.id), r]));
  const bySlug = new Map(existing.map((r) => [String(r.template_slug || ''), r]));

  for (const patch of responses) {
    const id = Number(patch.id || 0);
    const row = byId.get(id) || bySlug.get(String(patch.templateSlug || patch.template_slug || ''));
    if (!row) continue;
    await EmployeeEvaluationResponse.updateDraft(row.id, {
      ratings: patch.ratings,
      sectionActionItems: patch.sectionActionItems,
      reflection: patch.reflection,
      status: 'draft'
    });
  }

  if (cycle.status === 'scheduled') {
    await EmployeeEvaluationCycle.update(cycleId, { status: 'in_progress' });
  }

  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'draft_saved',
    detail: { responseCount: responses.length }
  });

  return getCycleBundle(cycleId);
}

export async function submitEvaluation({ cycleId, actorUserId, responses = [] }) {
  // Save latest draft first
  if (responses.length) {
    await saveEvaluationDraft({ cycleId, actorUserId, responses });
  }

  const cycle = await EmployeeEvaluationCycle.findById(cycleId);
  if (!cycle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  if (Number(cycle.employee_user_id) !== Number(actorUserId)) {
    const err = new Error('Only the employee can submit this self-assessment');
    err.status = 403;
    throw err;
  }
  if (['closed', 'cancelled', 'submitted', 'reviewed'].includes(cycle.status)) {
    const err = new Error('Evaluation cannot be submitted in its current state');
    err.status = 400;
    throw err;
  }

  const existing = await EmployeeEvaluationResponse.listForCycle(cycleId);
  const now = new Date();
  for (const row of existing) {
    await EmployeeEvaluationResponse.updateDraft(row.id, {
      status: 'submitted',
      submittedAt: now
    });
  }

  await EmployeeEvaluationCycle.update(cycleId, {
    status: 'submitted',
    submittedAt: now
  });

  if (cycle.assigned_task_id) {
    try {
      await Task.updateStatus(cycle.assigned_task_id, 'completed');
    } catch {
      try {
        await pool.execute(
          `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [cycle.assigned_task_id]
        );
      } catch {
        /* ignore */
      }
    }
  }

  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'submitted',
    detail: {}
  });

  return getCycleBundle(cycleId);
}

export async function adminCommentOnCycle({ cycleId, actorUserId, adminComments, markReviewed = true }) {
  const cycle = await EmployeeEvaluationCycle.findById(cycleId);
  if (!cycle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  const patch = { adminComments };
  if (markReviewed && ['submitted', 'in_progress', 'scheduled'].includes(cycle.status)) {
    patch.status = 'reviewed';
    patch.reviewedAt = new Date();
  }
  await EmployeeEvaluationCycle.update(cycleId, patch);
  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'admin_comment',
    detail: { markReviewed }
  });
  return getCycleBundle(cycleId);
}

export async function reopenEvaluation({ cycleId, actorUserId }) {
  const cycle = await EmployeeEvaluationCycle.findById(cycleId);
  if (!cycle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === 'closed') {
    const err = new Error('Closed evaluations cannot be reopened');
    err.status = 400;
    throw err;
  }
  const existing = await EmployeeEvaluationResponse.listForCycle(cycleId);
  for (const row of existing) {
    await EmployeeEvaluationResponse.updateDraft(row.id, {
      status: 'draft',
      submittedAt: null
    });
  }
  await EmployeeEvaluationCycle.update(cycleId, {
    status: 'in_progress',
    submittedAt: null,
    reviewedAt: null
  });
  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'reopened',
    detail: {}
  });
  return getCycleBundle(cycleId);
}

export async function closeEvaluation({ cycleId, actorUserId }) {
  const bundle = await getCycleBundle(cycleId);
  if (!bundle) {
    const err = new Error('Evaluation cycle not found');
    err.status = 404;
    throw err;
  }
  await EmployeeEvaluationCycle.update(cycleId, {
    status: 'closed',
    closedAt: new Date(),
    finalSnapshotJson: {
      cycle: bundle.cycle,
      responses: bundle.responses,
      closedByUserId: actorUserId,
      closedAt: new Date().toISOString()
    }
  });
  await EmployeeEvaluationActivity.create({
    cycleId,
    actorUserId,
    eventType: 'closed',
    detail: {}
  });
  return getCycleBundle(cycleId);
}

export async function listAgencyEvaluationRoster({ agencyId, periodYear, periodHalf }) {
  const period = periodYear && periodHalf
    ? { periodYear: Number(periodYear), periodHalf }
    : currentEvaluationPeriod();

  const [employees] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status,
            u.has_supervisor_privileges, u.title,
            hp.applied_role, jd.id AS job_description_id, jd.title AS job_title
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     LEFT JOIN hiring_profiles hp ON hp.id = (
       SELECT hp2.id FROM hiring_profiles hp2
       WHERE hp2.candidate_user_id = u.id
       ORDER BY hp2.updated_at DESC, hp2.id DESC LIMIT 1
     )
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
     WHERE u.is_active = TRUE
       AND u.role NOT IN ('client', 'client_guardian', 'guardian')
       AND u.status IN ('ACTIVE_EMPLOYEE', 'ONBOARDING', 'PREHIRE_REVIEW', 'PENDING_SETUP')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [agencyId]
  );

  const [cycles] = await pool.execute(
    `SELECT * FROM employee_evaluation_cycles
     WHERE agency_id = ? AND period_year = ? AND period_half = ?`,
    [agencyId, period.periodYear, period.periodHalf]
  );
  const byUser = new Map((cycles || []).map((c) => [Number(c.employee_user_id), c]));

  return {
    period,
    employees: (employees || []).map((e) => {
      const cycle = byUser.get(Number(e.id)) || null;
      return {
        userId: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        email: e.email,
        role: e.role,
        title: e.title,
        jobTitle: e.job_title || e.applied_role || null,
        jobDescriptionId: e.job_description_id || null,
        hasSupervisorPrivileges: !!(e.has_supervisor_privileges === 1 || e.has_supervisor_privileges === true),
        cycle: cycle
          ? {
              id: cycle.id,
              status: cycle.status,
              scheduleEventId: cycle.schedule_event_id,
              submittedAt: cycle.submitted_at,
              dueAt: cycle.due_at
            }
          : null,
        rosterStatus: cycle?.status || 'not_scheduled'
      };
    })
  };
}

export async function listTemplatesForJob({ agencyId, jobDescriptionId }) {
  const attached = await HiringJobEvaluationTemplate.listForJob(jobDescriptionId);
  return (attached || []).map((row) => ({
    attachmentId: row.id,
    templateId: row.template_id,
    slug: row.slug,
    name: row.template_name,
    version: row.version,
    isPrimary: !!(row.is_primary === 1 || row.is_primary === true),
    isSupervisorRubric: !!(row.is_supervisor_rubric === 1 || row.is_supervisor_rubric === true),
    rubric: parseJson(row.rubric_json, {})
  }));
}

export async function generateAndAttachTemplateForJob({
  agencyId,
  jobDescriptionId,
  createdByUserId = null
}) {
  const [rows] = await pool.execute(
    `SELECT * FROM hiring_job_descriptions WHERE id = ? AND agency_id = ? LIMIT 1`,
    [jobDescriptionId, agencyId]
  );
  const jd = rows?.[0];
  if (!jd) {
    const err = new Error('Job description not found');
    err.status = 404;
    throw err;
  }
  const rubric = generateRubricFromJobDescription(jd);
  const slug = templateSlugForJobDescription(jd);
  const tpl = await EmployeeEvaluationTemplate.createVersion({
    agencyId,
    slug,
    name: rubric.title,
    rubricJson: rubric,
    isSupervisorRubric: false,
    createdByUserId
  });
  await HiringJobEvaluationTemplate.setPrimary({
    agencyId,
    jobDescriptionId,
    templateId: tpl.id
  });
  return listTemplatesForJob({ agencyId, jobDescriptionId });
}

export async function attachTemplateToJob({ agencyId, jobDescriptionId, templateId }) {
  await HiringJobEvaluationTemplate.setPrimary({ agencyId, jobDescriptionId, templateId });
  return listTemplatesForJob({ agencyId, jobDescriptionId });
}

export default {
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
};
