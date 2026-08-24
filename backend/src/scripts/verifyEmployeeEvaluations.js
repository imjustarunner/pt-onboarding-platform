/**
 * One-off verification for employee evaluation cycle lifecycle.
 * Run: node backend/src/scripts/verifyEmployeeEvaluations.js
 */
import pool from '../config/database.js';
import {
  previewTemplatesForEmployee,
  createEvaluationCycle,
  saveEvaluationDraft,
  submitEvaluation,
  reopenEvaluation
} from '../services/employeeEvaluation.service.js';

const agencyId = 2;
const testYear = 2099;
const testHalf = 'H1';

const [users] = await pool.execute(
  `SELECT u.id, u.first_name, u.last_name, u.has_supervisor_privileges, hp.job_description_id
   FROM users u
   JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
   LEFT JOIN hiring_profiles hp ON hp.id = (
     SELECT hp2.id FROM hiring_profiles hp2
     WHERE hp2.candidate_user_id = u.id
     ORDER BY hp2.updated_at DESC, hp2.id DESC LIMIT 1
   )
   WHERE u.role NOT IN ('client','parent','guardian','kiosk')
     AND u.status = 'ACTIVE_EMPLOYEE'
   ORDER BY (hp.job_description_id IS NOT NULL) DESC, u.id ASC
   LIMIT 5`,
  [agencyId]
);

const employee = users[0];
if (!employee) throw new Error('No ITSCO employee found');

console.log('employee', {
  id: employee.id,
  name: `${employee.first_name} ${employee.last_name}`,
  jd: employee.job_description_id,
  supervisor: employee.has_supervisor_privileges
});

const preview = await previewTemplatesForEmployee({ agencyId, employeeUserId: employee.id });
console.log(
  'preview',
  preview.templates.map((t) => ({ slug: t.slug, supervisor: !!t.isSupervisorRubric }))
);

await pool.execute(
  `DELETE FROM employee_evaluation_cycles
   WHERE agency_id = ? AND employee_user_id = ? AND period_year = ? AND period_half = ?`,
  [agencyId, employee.id, testYear, testHalf]
);

const bundle = await createEvaluationCycle({
  agencyId,
  employeeUserId: employee.id,
  initiatedByUserId: 501,
  periodYear: testYear,
  periodHalf: testHalf
});
console.log('created', {
  cycleId: bundle.cycle.id,
  responses: bundle.responses.length,
  taskId: bundle.cycle.assigned_task_id,
  status: bundle.cycle.status
});

let dupStatus = null;
try {
  await createEvaluationCycle({
    agencyId,
    employeeUserId: employee.id,
    initiatedByUserId: 501,
    periodYear: testYear,
    periodHalf: testHalf
  });
} catch (e) {
  dupStatus = e.status || null;
}
console.log('duplicatePrevented', dupStatus === 409);

const resp = bundle.responses[0];
const rubric = resp.rubric_snapshot_json || {};
const ckey = rubric?.sections?.[0]?.criteria?.[0]?.key || 'c1';

await saveEvaluationDraft({
  cycleId: bundle.cycle.id,
  actorUserId: employee.id,
  responses: [
    {
      id: resp.id,
      templateSlug: resp.template_slug,
      ratings: { [ckey]: 3 },
      sectionActionItems: { core_responsibilities: 'Continue mentoring' },
      reflection: { strengths: 'Steady progress' }
    }
  ]
});

const submitted = await submitEvaluation({
  cycleId: bundle.cycle.id,
  actorUserId: employee.id,
  responses: []
});
console.log('submitted', submitted.cycle.status);

let locked = false;
try {
  await saveEvaluationDraft({
    cycleId: bundle.cycle.id,
    actorUserId: employee.id,
    responses: [{ id: resp.id, ratings: { [ckey]: 4 } }]
  });
} catch (e) {
  locked = e.status === 400;
}
console.log('lockedAfterSubmit', locked);

await reopenEvaluation({ cycleId: bundle.cycle.id, actorUserId: 501 });
const reopened = await pool.execute(
  `SELECT status FROM employee_evaluation_cycles WHERE id = ?`,
  [bundle.cycle.id]
);
console.log('reopenedStatus', reopened[0]?.[0]?.status);

const [taskRows] = await pool.execute(
  `SELECT status FROM tasks WHERE id = ?`,
  [bundle.cycle.assigned_task_id]
);
console.log('taskStatusAfterSubmit', taskRows?.[0]?.status);

await pool.execute(`DELETE FROM employee_evaluation_cycles WHERE id = ?`, [bundle.cycle.id]);
if (bundle.cycle.assigned_task_id) {
  await pool.execute(`DELETE FROM tasks WHERE id = ?`, [bundle.cycle.assigned_task_id]);
}

console.log('VERIFY_OK');
process.exit(0);
