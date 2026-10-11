import pool from '../config/database.js';
import { recordDocumentQuestion } from './documentAnalytics.service.js';
import { referenceAllowed } from './companyReferenceContent.js';
import { answerFromHandbook } from './workplaceHandbookAssistant.service.js';
import { recordOnboardingActivity } from './hireJourney.service.js';
import { trainingDefinitionsFor, requiredTrainingKeys, expectedSchoolWork, validateTrainingDefinition, trainingMatchesEdition, trainingTemplateForEdition, learnerDefinition, trainingHash, gradeDocumentQuiz, validateTrainingHeartbeat, trainingCreditSeconds } from './documentTrainingContent.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const json = (value, fallback = {}) => value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value;
const activeEmployee = user => ['ACTIVE_EMPLOYEE', 'ACTIVE'].includes(String(user.status || '').toUpperCase()) && ![false, 0, '0'].includes(user.is_active) && ![true, 1, '1'].includes(user.is_archived) && !user.terminated_at;
const canLearn = user => (user.status === 'ONBOARDING' || activeEmployee(user)) && ![false, 0, '0'].includes(user.is_active) && ![true, 1, '1'].includes(user.is_archived) && !user.terminated_at;
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const bookFromRow = row => row ? { metadata: json(row.metadata_json), sections: json(row.sections_json, []), version: { id: row.id, version_number: row.version_number, is_draft: row.is_draft } } : null;
async function transaction(userId, action) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) fail('Staff member not found.', 404);
    const result = await action(db, user);
    await db.commit(); return result;
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
export async function learningContext(agencyId, userId, db = pool) {
  if (!positiveId(agencyId) || !positiveId(userId)) fail('Select a company and staff member.');
  const [[agency]] = await db.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [Number(agencyId)]);
  const [[user]] = await db.execute('SELECT u.*, ua.agency_role, ua.agency_position FROM users u JOIN user_agencies ua ON ua.user_id = u.id WHERE u.id = ? AND ua.agency_id = ?', [Number(userId), Number(agencyId)]);
  if (!agency || !user) fail('Company learning access denied.', 403);
  let preference = null;
  if (trainingDefinitionsFor(agency).length) {
    const [[row]] = await db.execute('SELECT expected_school_work FROM company_document_training_preferences WHERE agency_id = ? AND user_id = ?', [agencyId, userId]);
    preference = row?.expected_school_work;
  }
  return { agency, user, expectedSchoolWork: expectedSchoolWork(agency, user, preference), requiredKeys: requiredTrainingKeys(agency, user, preference) };
}
function registered(agency, key) {
  const definition = trainingDefinitionsFor(agency).find(d => d.documentKey === key);
  if (!definition || !referenceAllowed(agency, key)) fail('Training is not available for this company.', 404);
  return definition;
}
export async function documentTrainingCourse(agency, key, db = pool) {
  const template = registered(agency, key);
  const [[row]] = await db.execute(`SELECT v.* FROM company_reference_documents d JOIN company_reference_versions v
    ON v.id = d.published_version_id AND v.document_id = d.id AND v.is_draft = 0 WHERE d.agency_id = ? AND d.document_key = ?`, [agency.id, key]);
  const book = bookFromRow(row);
  if (!book) return { key, title: template.title, status: 'unpublished', definition: template, book: null };
  const [[review]] = await db.execute('SELECT * FROM company_document_training_reviews WHERE agency_id = ? AND document_key = ? AND version_id = ?', [agency.id, key, row.id]);
  const [[previousReview]] = !review ? await db.execute('SELECT definition_json FROM company_document_training_reviews WHERE agency_id = ? AND document_key = ? ORDER BY reviewed_at DESC, version_id DESC LIMIT 1', [agency.id, key]) : [[]];
  const definition = review ? json(review.definition_json) : previousReview ? json(previousReview.definition_json) : trainingTemplateForEdition(template, book);
  const ready = trainingMatchesEdition(definition, book);
  return { key, title: definition.title, status: ready ? 'ready' : 'needs_review', definition, book, revision: trainingHash(definition) };
}
export async function reviewDocumentTraining(agencyId, key, actorId, input) {
  return transaction(actorId, async db => {
    const [[agency]] = await db.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [agencyId]);
    if (!agency) fail('Company not found.', 404);
    registered(agency, key);
    // Serialize quiz approval with publication. A review cannot silently bind to
    // a different document edition while an administrator is saving it.
    const [[document]] = await db.execute('SELECT * FROM company_reference_documents WHERE agency_id = ? AND document_key = ? FOR UPDATE', [agencyId, key]);
    if (!document?.published_version_id || Number(input.expectedVersionId) !== Number(document.published_version_id)) fail('The guide changed. Reload before approving its training.', 409);
    const [[row]] = await db.execute('SELECT * FROM company_reference_versions WHERE id = ? AND document_id = ? AND is_draft = 0', [document.published_version_id, document.id]);
    const definition = validateTrainingDefinition(input.definition, bookFromRow(row));
    const revision = trainingHash(definition);
    const [[previous]] = await db.execute('SELECT revision FROM company_document_training_reviews WHERE agency_id = ? AND document_key = ? AND version_id = ? FOR UPDATE', [agencyId, key, row.id]);
    if ((previous?.revision || null) !== (input.expectedReviewRevision || null)) fail('Another administrator changed this training review. Reload it.', 409);
    await db.execute(`INSERT INTO company_document_training_reviews (agency_id, document_key, version_id, definition_json, revision, reviewed_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE definition_json = VALUES(definition_json), revision = VALUES(revision), reviewed_by_user_id = VALUES(reviewed_by_user_id), reviewed_at = CURRENT_TIMESTAMP`,
    [agencyId, key, row.id, JSON.stringify(definition), revision, actorId]);
    return { revision, versionId: row.id };
  });
}
export async function trainingReviewWorkspace(agencyId, key) {
  const [[agency]] = await pool.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) fail('Company not found.', 404);
  const course = await documentTrainingCourse(agency, key);
  const [[review]] = course.book ? await pool.execute('SELECT revision FROM company_document_training_reviews WHERE agency_id = ? AND document_key = ? AND version_id = ?', [agencyId, key, course.book.version.id]) : [[]];
  return { ...course, reviewRevision: review?.revision || null };
}
export async function guideLearningCatalog(agencyId, userId) {
  const context = await learningContext(agencyId, userId);
  const definitions = trainingDefinitionsFor(context.agency);
  if (!definitions.length) return { courses: [], expectedSchoolWork: false };
  const [enrollments] = await pool.execute('SELECT id, document_key, purpose, status, version_id, started_at, completed_at FROM company_document_learning WHERE agency_id = ? AND user_id = ? ORDER BY id DESC', [agencyId, userId]);
  const [[journey]] = await pool.execute('SELECT onboarding_completed_at FROM hire_journeys WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
  const courses = [];
  for (const template of definitions) {
    const course = await documentTrainingCourse(context.agency, template.documentKey);
    const records = enrollments.filter(e => e.document_key === template.documentKey);
    courses.push({ key: template.documentKey, title: course.title, description: template.description, status: course.status, version: course.book?.version || null,
      questionCount: course.definition.questions.length, readingCount: course.definition.requiredSections.length,
      onboardingDefault: context.requiredKeys.includes(template.documentKey),
      onboardingRequired: context.user.status === 'ONBOARDING' && !!journey && !journey.onboarding_completed_at && context.requiredKeys.includes(template.documentKey),
      enrollments: records, libraryPath: `/library?companyDocument=${template.documentKey}` });
  }
  return { courses, expectedSchoolWork: context.expectedSchoolWork, learnerStatus: activeEmployee(context.user) ? 'ACTIVE_EMPLOYEE' : context.user.status };
}
export async function saveTrainingPreference(agencyId, userId, actorId, expected) {
  if (typeof expected !== 'boolean') fail('Choose whether this employee is expected to work in schools.');
  const context = await learningContext(agencyId, userId);
  if (!trainingDefinitionsFor(context.agency).some(d => d.onboardingAudience === 'school')) fail('School training does not apply to this company.', 404);
  return transaction(userId, async db => {
    await db.execute(`INSERT INTO company_document_training_preferences (agency_id, user_id, expected_school_work, updated_by_user_id) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE expected_school_work = VALUES(expected_school_work), updated_by_user_id = VALUES(updated_by_user_id)`, [agencyId, userId, expected, actorId]);
    return { expectedSchoolWork: expected };
  });
}
export async function startGuideLearning(agencyId, userId, key, input, actorId = null) {
  return transaction(userId, async (db, user) => {
    const context = await learningContext(agencyId, userId, db);
    registered(context.agency, key);
    if (!canLearn(user)) fail('Training is available during onboarding and active employment.', 403);
    const purpose = input.purpose;
    if (!['onboarding', 'assigned', 'practice'].includes(purpose) || (purpose === 'assigned' && !actorId)) fail('Choose an authorized training activity.', 403);
    if (purpose === 'onboarding') {
      const [[journey]] = await db.execute('SELECT onboarding_completed_at FROM hire_journeys WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
      if (user.status !== 'ONBOARDING' || !journey || journey.onboarding_completed_at || !context.requiredKeys.includes(key)) fail('This guide is not required in the open onboarding package.', 403);
    }
    if (purpose !== 'onboarding' && !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestKey || '')) fail('A unique training request is required.');
    const assignmentKey = purpose === 'onboarding' ? 'onboarding' : `${purpose}:${input.requestKey}`;
    const [[existing]] = await db.execute('SELECT id FROM company_document_learning WHERE agency_id = ? AND user_id = ? AND document_key = ? AND assignment_key = ?', [agencyId, userId, key, assignmentKey]);
    if (existing) return { id: existing.id };
    const course = await documentTrainingCourse(context.agency, key, db);
    if (course.status !== 'ready') fail(course.status === 'unpublished' ? 'Publish the guide before assigning its training.' : 'Review the questions against the current guide before assigning this training.', 409);
    if (Number(input.expectedVersionId) !== Number(course.book.version.id)) fail('The guide edition changed. Reload before starting.', 409);
    if (purpose === 'assigned') {
      const [[open]] = await db.execute("SELECT id FROM company_document_learning WHERE agency_id = ? AND user_id = ? AND document_key = ? AND purpose = 'assigned' AND status = 'in_progress' AND version_id = ?", [agencyId, userId, key, course.book.version.id]);
      if (open) return { id: open.id };
    }
    const [result] = await db.execute(`INSERT INTO company_document_learning (agency_id, user_id, document_key, version_id, course_revision, definition_json, assignment_key, purpose, read_sections_json, assigned_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?)`, [agencyId, userId, key, course.book.version.id, course.revision, JSON.stringify(course.definition), assignmentKey, purpose, actorId]);
    return { id: result.insertId };
  });
}
async function ownedLearning(agencyId, userId, id, db = pool) {
  if (!positiveId(id)) fail('Training not found.', 404);
  const context = await learningContext(agencyId, userId, db);
  const [[row]] = await db.execute('SELECT * FROM company_document_learning WHERE id = ? AND agency_id = ? AND user_id = ?', [id, agencyId, userId]);
  if (!row || !referenceAllowed(context.agency, row.document_key)) fail('Training not found.', 404);
  registered(context.agency, row.document_key);
  const [[version]] = await db.execute(`SELECT v.* FROM company_reference_versions v JOIN company_reference_documents d ON d.id = v.document_id
    WHERE v.id = ? AND d.agency_id = ? AND d.document_key = ? AND v.is_draft = 0`, [row.version_id, agencyId, row.document_key]);
  if (!version) fail('Assigned guide edition not found.', 404);
  return { row, book: bookFromRow(version), definition: json(row.definition_json), context };
}
export async function guideLearningDetail(agencyId, userId, id) {
  const { row, book, definition, context } = await ownedLearning(agencyId, userId, id);
  const [attempts] = await pool.execute('SELECT id, result_json, created_at FROM company_document_learning_attempts WHERE learning_id = ? ORDER BY id DESC LIMIT 20', [id]);
  const [time] = await pool.execute('SELECT work_date, seconds, submitted_seconds, payroll_claim_ids_json FROM company_document_learning_time WHERE learning_id = ? ORDER BY work_date', [id]);
  return { id: row.id, key: row.document_key, purpose: row.purpose, status: row.status, completedAt: row.completed_at,
    book, definition: learnerDefinition(definition), readSections: json(row.read_sections_json, []), attempts: attempts.map(a => ({ id: a.id, ...json(a.result_json), createdAt: a.created_at })),
    paid: row.purpose !== 'practice', onboardingTime: row.purpose !== 'practice' && context.user.status === 'ONBOARDING',
    time: time.map(t => ({ workDate: t.work_date, seconds: t.seconds, submittedSeconds: t.submitted_seconds, claimIds: json(t.payroll_claim_ids_json, []) })) };
}
async function assertOpenLearning(db, user, row) {
  if (!canLearn(user)) fail('Training is closed for this account.', 403);
  if (row.status === 'completed') fail('This training is complete. Start an on-demand review to practice again.', 409);
  if (user.status === 'ONBOARDING' && row.purpose !== 'practice') {
    const [[journey]] = await db.execute('SELECT agency_id, onboarding_completed_at FROM hire_journeys WHERE user_id = ?', [user.id]);
    if (!journey || Number(journey.agency_id) !== Number(row.agency_id)) fail('Use the training assigned by your onboarding company.', 403);
    if (journey.onboarding_completed_at) fail('Onboarding has already been submitted.', 409);
  }
}
export async function markGuideReading(agencyId, userId, id, slug) {
  return transaction(userId, async (db, user) => {
    const { row, definition } = await ownedLearning(agencyId, userId, id, db);
    await assertOpenLearning(db, user, row);
    if (!definition.requiredSections.includes(slug)) fail('Select a required reading section.');
    const read = [...new Set([...json(row.read_sections_json, []), slug])];
    await db.execute('UPDATE company_document_learning SET read_sections_json = ? WHERE id = ?', [JSON.stringify(read), id]);
    return { readSections: read };
  });
}
export async function submitGuideQuiz(agencyId, userId, id, input) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestKey || '')) fail('A unique submission request is required.');
  return transaction(userId, async (db, user) => {
    const { row, definition } = await ownedLearning(agencyId, userId, id, db);
    const [[previous]] = await db.execute('SELECT result_json FROM company_document_learning_attempts WHERE learning_id = ? AND request_key = ?', [id, input.requestKey]);
    if (previous) return json(previous.result_json);
    await assertOpenLearning(db, user, row);
    const read = new Set(json(row.read_sections_json, []));
    if (definition.requiredSections.some(slug => !read.has(slug))) fail('Review and acknowledge each required reading section before submitting the quiz.');
    const result = gradeDocumentQuiz(definition, input.answers);
    await db.execute('INSERT INTO company_document_learning_attempts (learning_id, request_key, answers_json, result_json) VALUES (?, ?, ?, ?)', [id, input.requestKey, JSON.stringify(input.answers), JSON.stringify(result)]);
    if (result.passed) await db.execute("UPDATE company_document_learning SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?", [id]);
    return result;
  });
}
export async function answerGuideLearning(agencyId, userId, id, input) {
  const { book, row } = await ownedLearning(agencyId, userId, id);
  if (Number(input.expectedVersionId) !== Number(book.version.id)) fail('Reload the assigned edition before asking.', 409);
  let answer;
  try { answer = await answerFromHandbook({ handbook: book, question: input.question, history: input.history || [] }); return answer; }
  finally { await recordDocumentQuestion({ agencyId, userId, documentKey: row.document_key, versionId: book.version.id, question: input.question, status: answer?.status || 'error', surface: row.purpose === 'practice' ? 'on-demand' : row.purpose === 'onboarding' ? 'onboarding' : 'assigned-training' }); }
}
export async function heartbeatGuideLearning(agencyId, userId, id, raw) {
  const input = validateTrainingHeartbeat(raw);
  const { row, context } = await ownedLearning(agencyId, userId, id);
  if (row.purpose === 'practice') return { tracking: false, paid: false, creditedSeconds: 0 };
  if (row.status === 'completed') return { tracking: false, paid: true, creditedSeconds: 0 };
  // The existing onboarding ledger is the sole payroll source while onboarding.
  // Its user-wide lease also prevents simultaneous portal/guide tabs double paying.
  if (context.user.status === 'ONBOARDING') {
    await assertOpenLearning(pool, context.user, row);
    return { ...await recordOnboardingActivity(userId, input), paid: true, onboardingTime: true };
  }
  return transaction(userId, async (db, user) => {
    const current = await ownedLearning(agencyId, userId, id, db);
    await assertOpenLearning(db, user, current.row);
    await db.execute('INSERT IGNORE INTO company_document_learning_activity (user_id) VALUES (?)', [userId]);
    const [[activity]] = await db.execute('SELECT *, UTC_TIMESTAMP(3) AS server_now FROM company_document_learning_activity WHERE user_id = ? FOR UPDATE', [userId]);
    if (activity.session_id === input.sessionId && input.sequence <= activity.sequence_number) return { tracking: !!activity.active, creditedSeconds: 0, paid: true };
    if (activity.session_id !== input.sessionId && !input.active && activity.active && new Date(activity.server_now) - new Date(activity.seen_at) < 45000) return { tracking: false, creditedSeconds: 0, paid: true };
    const seconds = Number(activity.learning_id) === Number(id) ? trainingCreditSeconds(activity, input, activity.server_now) : 0;
    await db.execute('UPDATE company_document_learning_activity SET learning_id = ?, session_id = ?, sequence_number = ?, active = ?, seen_at = UTC_TIMESTAMP(3) WHERE user_id = ?', [id, input.sessionId, input.sequence, input.active, userId]);
    if (seconds) {
      const end = Math.floor(new Date(activity.server_now).getTime() / 1000) * 1000;
      let start = end - seconds * 1000;
      while (start < end) {
        const date = new Date(start).toISOString().slice(0, 10);
        const segmentEnd = Math.min(end, Date.parse(date + 'T00:00:00.000Z') + 86400000);
        await db.execute(`INSERT INTO company_document_learning_time (learning_id, work_date, seconds, payroll_claim_ids_json) VALUES (?, ?, ?, JSON_ARRAY())
          ON DUPLICATE KEY UPDATE seconds = seconds + VALUES(seconds)`, [id, date, Math.round((segmentEnd - start) / 1000)]);
        start = segmentEnd;
      }
    }
    return { tracking: input.active, creditedSeconds: seconds, paid: true, onboardingTime: false };
  });
}
export async function submitGuideTime(agencyId, userId, id) {
  return transaction(userId, async (db, user) => {
    const { row, definition } = await ownedLearning(agencyId, userId, id, db);
    if (row.purpose === 'practice') fail('Optional on-demand review is on your own time; it does not create a pay claim.', 403);
    if (user.status === 'ONBOARDING') return { onboardingTime: true, message: 'Included in your onboarding time; submitted with your onboarding package.', claimIds: [] };
    if (!activeEmployee(user)) fail('Paid training submissions are unavailable for this account.', 403);
    const [days] = await db.execute('SELECT * FROM company_document_learning_time WHERE learning_id = ? FOR UPDATE', [id]);
    const claims = [];
    for (const day of days) {
      const seconds = Number(day.seconds) - Number(day.submitted_seconds);
      if (seconds <= 0) continue;
      const payload = { source: 'company_document_learning', learningId: Number(id), documentKey: row.document_key, documentVersionId: row.version_id,
        courseRevision: row.course_revision, categoryLabel: 'Assigned guide training', meetingType: 'Training', title: definition.title,
        totalMinutes: seconds / 60, durationMinutes: seconds / 60, actualSeconds: seconds,
        notes: 'Recorded active assigned training time, including reading, questions and quiz retries. UTC work date. Completion is not a prerequisite for recording work.' };
      const [claim] = await db.execute(`INSERT INTO payroll_time_claims (agency_id, user_id, submitted_by_user_id, status, claim_type, claim_date, payload_json)
        VALUES (?, ?, ?, 'submitted', 'meeting_training', ?, ?)`, [agencyId, userId, userId, day.work_date, JSON.stringify(payload)]);
      await db.execute('UPDATE company_document_learning_time SET submitted_seconds = seconds, payroll_claim_ids_json = ? WHERE learning_id = ? AND work_date = ?', [JSON.stringify([...json(day.payroll_claim_ids_json, []), claim.insertId]), id, day.work_date]);
      claims.push(claim.insertId);
    }
    return { claimIds: claims, message: claims.length ? 'Recorded time submitted for payroll review.' : 'All recorded time has already been submitted, or no time has been recorded yet.' };
  });
}
export async function onboardingGuideSteps(user, agencyId, db = pool, { closed = false } = {}) {
  const [[agency]] = await db.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [agencyId]);
  if (!agency || !trainingDefinitionsFor(agency).length) return [];
  const context = await learningContext(agencyId, user.id, db);
  const [rows] = await db.execute("SELECT id, document_key, status FROM company_document_learning WHERE agency_id = ? AND user_id = ? AND purpose = 'onboarding'", [agencyId, user.id]);
  const keys = closed ? [...new Set(rows.map(r => r.document_key))].filter(key => trainingDefinitionsFor(agency).some(d => d.documentKey === key)) : context.requiredKeys;
  return keys.map(key => ({ key: `guide-training-${key}`, kind: 'guide-training', title: registered(agency, key).title,
    documentKey: key, required: true, complete: rows.some(r => r.document_key === key && r.status === 'completed'), learningId: rows.find(r => r.document_key === key)?.id || null }));
}
export async function assertOnboardingGuideTraining(userId, agencyId, db = pool) {
  const [[user]] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) fail('Employee not found.', 404);
  const steps = await onboardingGuideSteps(user, agencyId, db);
  if (steps.some(s => !s.complete)) fail('Complete the required guide reading and quizzes before submitting onboarding.');
}
