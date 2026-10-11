import pool from '../config/database.js';
import User from '../models/User.model.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import { studentTrainingTemplate, validateTrainingResponse } from './studentTrainingEvaluationForm.js';
import { handbookTenant } from './handbookTenant.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const trainingId = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'A valid record or agency ID is required.'); return id; };
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const isRoot = user => ['super_admin', 'superadmin'].includes(String(user?.role).toLowerCase());
const assignedSql = `EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.agency_id = e.agency_id AND sa.supervisee_id = e.student_user_id AND sa.supervisor_id = ? AND sa.supervisor_type = 'clinical')`;
const namesSql = `SELECT e.*, CONCAT_WS(' ', student.first_name, student.last_name) AS student_name, CONCAT_WS(' ', evaluator.first_name, evaluator.last_name) AS evaluator_name FROM student_training_evaluations e JOIN users student ON student.id = e.student_user_id JOIN users evaluator ON evaluator.id = e.evaluator_user_id`;
const listSql = namesSql.replace('e.*', 'e.id, e.student_user_id, e.period_year, e.period_quarter, e.status, e.total_score, e.outcome');

export async function trainingScope(user, agencyId) {
  agencyId = trainingId(agencyId);
  if (!user?.id) fail(401, 'Sign in to view evaluations.');
  if (!isRoot(user) && !(await User.getAgencies(user.id)).some(a => Number(a.id) === agencyId)) fail(403, 'Agency access denied.');
  const [agencies] = await pool.execute('SELECT id, slug FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  if (!handbookTenant(agencies[0])) fail(404, 'This evaluation form is not configured for this agency.');
  return { agencyId, userId: Number(user.id), manage: isRoot(user) || getUserCapabilities(user).canManageHiring === true };
}

async function isAssigned(scope, studentId, db = pool) {
  const [rows] = await db.execute(`SELECT id FROM supervisor_assignments WHERE agency_id = ? AND supervisee_id = ? AND supervisor_id = ? AND supervisor_type = 'clinical' LIMIT 1`, [scope.agencyId, studentId, scope.userId]);
  return !!rows.length;
}

export async function trainingRecordAccess(scope, row, db = pool) {
  if (!row || Number(row.agency_id) !== scope.agencyId) fail(404, 'Evaluation not found.');
  const self = Number(row.student_user_id) === scope.userId;
  const evaluator = Number(row.evaluator_user_id) === scope.userId && await isAssigned(scope, row.student_user_id, db);
  if (!(scope.manage || evaluator || (self && row.status === 'submitted'))) fail(403, 'This evaluation is not available to you.');
  return { canEdit: !self && row.status === 'draft' && (scope.manage || evaluator) };
}

const present = (row, access) => ({
  id: row.id, agencyId: row.agency_id, studentUserId: row.student_user_id, evaluatorUserId: row.evaluator_user_id,
  studentName: row.student_name, evaluatorName: row.evaluator_name, year: row.period_year, quarter: row.period_quarter,
  status: row.status, revision: row.revision, total: row.total_score, outcome: row.outcome, submittedAt: row.submitted_at,
  updatedAt: row.updated_at, template: json(row.template_snapshot_json), response: json(row.response_json), ...access
});

export async function listTrainingEvaluations(scope) {
  const [students] = await pool.execute(`SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
    WHERE u.is_active = 1 AND u.employment_type = 'intern' AND u.id <> ?
    AND (? = 1 OR EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.agency_id = ua.agency_id AND sa.supervisee_id = u.id AND sa.supervisor_id = ? AND sa.supervisor_type = 'clinical'))
    ORDER BY u.last_name, u.first_name`, [scope.agencyId, scope.userId, scope.manage ? 1 : 0, scope.userId]);
  const [rows] = await pool.execute(`${listSql} WHERE e.agency_id = ? AND (? = 1 OR (e.evaluator_user_id = ? AND ${assignedSql}) OR (e.student_user_id = ? AND e.status = 'submitted')) ORDER BY e.period_year DESC, e.period_quarter DESC, e.id DESC LIMIT 500`, [scope.agencyId, scope.manage ? 1 : 0, scope.userId, scope.userId, scope.userId]);
  // Lists intentionally exclude notes, scores per category and private drafts for interns.
  return { template: studentTrainingTemplate(), students, canManage: scope.manage, evaluations: rows.map(r => ({ id: r.id, studentUserId: r.student_user_id, studentName: r.student_name, evaluatorName: r.evaluator_name, year: r.period_year, quarter: r.period_quarter, status: r.status, total: r.total_score, outcome: r.outcome })) };
}

export async function getTrainingEvaluation(scope, id) {
  const [rows] = await pool.execute(`${namesSql} WHERE e.agency_id = ? AND e.id = ? LIMIT 1`, [scope.agencyId, trainingId(id)]);
  const access = await trainingRecordAccess(scope, rows[0]);
  return present(rows[0], access);
}

export async function createTrainingEvaluation(scope, input) {
  const studentId = trainingId(input.studentUserId), year = Number(input.year), quarter = Number(input.quarter);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) fail(400, 'Choose a valid review year and quarter.');
  if (studentId === scope.userId) fail(403, 'A supervisor must complete this evaluation; you cannot evaluate yourself.');
  const conn = await pool.getConnection();
  let id;
  try {
    await conn.beginTransaction();
    if (!scope.manage && !await isAssigned(scope, studentId, conn)) fail(403, 'Only the assigned clinical supervisor or People Operations may start this evaluation.');
    const [students] = await conn.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? WHERE u.id = ? AND u.is_active = 1 AND u.employment_type = 'intern' LIMIT 1`, [scope.agencyId, studentId]);
    if (!students.length) fail(400, 'Choose an active intern in this agency. Internship classification is maintained in the employee profile.');
    const template = studentTrainingTemplate();
    const [result] = await conn.execute(`INSERT INTO student_training_evaluations (agency_id, student_user_id, evaluator_user_id, period_year, period_quarter, template_snapshot_json, response_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, [scope.agencyId, studentId, scope.userId, year, quarter, JSON.stringify(template), JSON.stringify({ scores: {}, notes: {}, summary: '', nextSteps: '' })]);
    id = result.insertId;
    await conn.execute(`INSERT INTO student_training_evaluation_activity (evaluation_id, actor_user_id, action, revision) VALUES (?, ?, 'created', 1)`, [id, scope.userId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') fail(409, 'An evaluation already exists for this intern and quarter. Open the existing record.');
    throw error;
  } finally { conn.release(); }
  return getTrainingEvaluation(scope, id);
}

export async function saveTrainingEvaluation(scope, id, input, { submit = false } = {}) {
  id = trainingId(id);
  if (!Number.isInteger(input.revision) || input.revision < 1) fail(400, 'Reload the evaluation before saving.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM student_training_evaluations WHERE agency_id = ? AND id = ? FOR UPDATE', [scope.agencyId, id]);
    const row = rows[0];
    const access = await trainingRecordAccess(scope, row, conn);
    if (!access.canEdit) fail(403, 'This evaluation is read-only. Submitted evaluations cannot be changed.');
    if (Number(row.revision) !== input.revision) fail(409, 'This evaluation changed in another session. Reload before saving. Your unsaved text is still on screen.');
    const checked = validateTrainingResponse(json(row.template_snapshot_json), input.response, { complete: submit });
    await conn.execute(`UPDATE student_training_evaluations SET response_json = ?, total_score = ?, outcome = ?, status = ?, revision = revision + 1, submitted_by_user_id = ?, submitted_at = ? WHERE id = ? AND agency_id = ?`, [JSON.stringify(checked.response), checked.total, checked.outcome, submit ? 'submitted' : 'draft', submit ? scope.userId : null, submit ? new Date() : null, id, scope.agencyId]);
    await conn.execute('INSERT INTO student_training_evaluation_activity (evaluation_id, actor_user_id, action, revision) VALUES (?, ?, ?, ?)', [id, scope.userId, submit ? 'submitted' : 'draft_saved', input.revision + 1]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  return getTrainingEvaluation(scope, id);
}
