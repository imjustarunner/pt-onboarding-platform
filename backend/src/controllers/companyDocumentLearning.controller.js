import pool from '../config/database.js';
import User from '../models/User.model.js';
import { assertReferenceAccess } from '../services/companyReferenceDocuments.service.js';
import * as learning from '../services/companyDocumentLearning.service.js';
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };

export async function assertLearningAssigner(actor, agencyId, userId) {
  await assertReferenceAccess(actor, agencyId);
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1 || !(await User.getAgencies(userId)).some(a => Number(a.id) === Number(agencyId))) fail('Staff member is not in this company.');
  if (['admin', 'super_admin', 'superadmin'].includes(actor.role)) return;
  if (Number(actor.id) === Number(userId)) fail('A supervisor cannot assign paid training to themself.');
  const [[assignment]] = await pool.execute('SELECT id FROM supervisor_assignments WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ? LIMIT 1', [actor.id, userId, agencyId]);
  if (!assignment) fail('Only this employee’s supervisor or a company administrator can assign paid training.');
}
const route = operation => async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.body?.agencyId);
    // Regular JWTs contain identity and role, but no employment status. Resolve
    // current status before the library capability check, without promoting the
    // learner or trusting stale role claims for assignment authority.
    const current = req.user?.id ? await User.findById(req.user.id) : null;
    if (!current || !Number(current.is_active) || current.is_archived) fail('Library access denied.');
    req.user = {...req.user,role:current.role,status:current.status,effectiveRole:current.role};
    await assertReferenceAccess(req.user, agencyId);
    const result = await operation(req, agencyId);
    res.set('Cache-Control', 'private, no-store'); res.json(result);
  } catch (e) { next(e); }
};
export const catalog = route((req, agencyId) => learning.guideLearningCatalog(agencyId, req.user.id));
export const read = route((req, agencyId) => learning.readGuide(agencyId, req.user.id, req.params.key));
export const start = route((req, agencyId) => learning.startGuideLearning(agencyId, req.user.id, req.params.key, req.body));
export const detail = route((req, agencyId) => learning.guideLearningDetail(agencyId, req.user.id, req.params.id));
export const reading = route((req, agencyId) => learning.markGuideReading(agencyId, req.user.id, req.params.id, req.body.slug));
export const reflection = route((req, agencyId) => learning.revealGuideReflection(agencyId, req.user.id, req.params.id, req.body));
export const quiz = route((req, agencyId) => learning.submitGuideQuiz(agencyId, req.user.id, req.params.id, req.body));
export const heartbeat = route((req, agencyId) => learning.heartbeatGuideLearning(agencyId, req.user.id, req.params.id, req.body));
export const time = route((req, agencyId) => learning.submitGuideTime(agencyId, req.user.id, req.params.id));
export const answer = route((req, agencyId) => learning.answerGuideLearning(agencyId, req.user.id, req.params.id, req.body));
export const staff = route(async (req, agencyId) => {
  let canAssign = true;
  try { await assertLearningAssigner(req.user, agencyId, Number(req.params.userId)); }
  catch (e) {
    // People Operations can inspect the setup before promotion, but only an
    // actual supervisor or administrator can assign a paid refresher.
    if (e.status !== 403 || req.user.role !== 'support' || !(await User.getAgencies(req.params.userId)).some(a => Number(a.id) === agencyId)) throw e;
    canAssign = false;
  }
  return { ...await learning.guideLearningCatalog(agencyId, Number(req.params.userId)), canAssign };
});
export const preference = route(async (req, agencyId) => {
  await assertLearningAssigner(req.user, agencyId, Number(req.params.userId));
  return learning.saveTrainingPreference(agencyId, Number(req.params.userId), req.user.id, req.body.expectedSchoolWork);
});
export const assign = route(async (req, agencyId) => {
  await assertLearningAssigner(req.user, agencyId, Number(req.params.userId));
  return learning.startGuideLearning(agencyId, Number(req.params.userId), req.params.key, { ...req.body, purpose: 'assigned' }, req.user.id);
});
export const review = route(async (req, agencyId) => {
  await assertReferenceAccess(req.user, agencyId, { manage: true });
  return learning.trainingReviewWorkspace(agencyId, req.params.key);
});
export const saveReview = route(async (req, agencyId) => {
  await assertReferenceAccess(req.user, agencyId, { manage: true });
  return learning.reviewDocumentTraining(agencyId, req.params.key, req.user.id, req.body);
});

// The personal portal token, never a company/user id in its request body,
// determines the learner and organization for these endpoints.
export const portalLearning = action => async (req, res, next) => {
  try {
    if (req.portalUser.status !== 'ONBOARDING') fail('Guide training opens during onboarding.');
    const [[agency]] = await pool.execute(`SELECT a.id FROM hire_journeys j JOIN agencies a ON a.id = j.agency_id
      JOIN user_agencies ua ON ua.user_id = j.user_id AND ua.agency_id = a.id WHERE j.user_id = ?`, [req.portalUser.id]);
    if (!agency) fail('Onboarding company not found.', 404);
    const userId = req.portalUser.id, id = req.params.id;
    const operations = {
      catalog: () => learning.guideLearningCatalog(agency.id, userId),
      read: () => learning.readGuide(agency.id, userId, req.params.key),
      start: () => learning.startGuideLearning(agency.id, userId, req.params.key, { ...req.body, purpose: 'onboarding' }),
      detail: () => learning.guideLearningDetail(agency.id, userId, id),
      reading: () => learning.markGuideReading(agency.id, userId, id, req.body.slug),
      reflection: () => learning.revealGuideReflection(agency.id, userId, id, req.body),
      quiz: () => learning.submitGuideQuiz(agency.id, userId, id, req.body),
      heartbeat: () => learning.heartbeatGuideLearning(agency.id, userId, id, req.body),
      time: () => learning.submitGuideTime(agency.id, userId, id),
      answer: () => learning.answerGuideLearning(agency.id, userId, id, req.body)
    };
    const value = await operations[action]();
    res.set('Cache-Control', 'private, no-store'); res.json(value);
  } catch (e) { next(e); }
};
