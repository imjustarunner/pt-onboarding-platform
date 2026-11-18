import pool from '../config/database.js';
import StudentLearningPlan from '../models/StudentLearningPlan.model.js';
import { AcademicSkillEvidence, TutoringSessionNote, TutoringSessionBrief } from '../models/TutoringSessionLearning.model.js';
import { assembleLearningSession } from '../../../frontend/src/navigation/tutoringSessionDocumentation.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
// The caller must authorize the student and assigned session first. Row locks
// serialize saves; the server resolves every title and strategy from the plan.
export async function saveLearningPlanSessionNote(payload, actorUserId, { subject, db: suppliedDb, req = null } = {}) {
  if (!subject || !Number.isSafeInteger(Number(payload.sessionId)) || Number(payload.sessionId) < 1) throw fail(400, 'Open a scheduled tutoring session before saving its learning results.');
  const db = suppliedDb || await pool.getConnection();
  try {
    if (!suppliedDb) await db.beginTransaction();
    const [[session]] = await db.execute(`SELECT s.id, s.provider_user_id, s.student_subject_id, s.delivery_context, c.organization_id
      FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE s.id=? FOR UPDATE`, [Number(payload.sessionId)]);
    const [roster] = await db.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=?', [Number(payload.sessionId)]);
    const student = roster.length === 1 && Number(roster[0].client_id) === Number(subject.client_id) ? roster[0] : null;
    if (!session || !student || (!session.student_subject_id && subject.primary_tutor_user_id && Number(subject.primary_tutor_user_id) !== Number(session.provider_user_id)) || Number(session.organization_id) !== Number(subject.agency_id) || (session.student_subject_id && Number(session.student_subject_id) !== Number(subject.id))) throw fail(403, 'This learning plan belongs to a different student, subject or organization.');
    const active = await StudentLearningPlan.findActiveBySubject(subject.id, db);
    if (!active || Number(active.id) !== Number(payload.learningPlanId)) throw fail(409, 'The approved learning plan has changed or is unavailable. Reload the plan before saving.');
    const bundle = await StudentLearningPlan.getPlanBundle(active.id, db);
    if (!bundle || Number(bundle.plan.client_id) !== Number(subject.client_id) || Number(bundle.plan.agency_id) !== Number(subject.agency_id) || Number(bundle.plan.student_subject_id) !== Number(subject.id) || bundle.plan.status !== 'active' || !bundle.plan.approved_at) throw fail(409, 'An approved active learning plan is required.');
    const loadedBrief = await TutoringSessionBrief.findBySession(session.id, db);
    const brief = loadedBrief && Number(loadedBrief.learning_plan_id) === Number(active.id) && Number(loadedBrief.agency_id) === Number(subject.agency_id) && Number(loadedBrief.client_id) === Number(subject.client_id) && Number(loadedBrief.student_subject_id) === Number(subject.id) ? loadedBrief : null;
    const checklist = assembleLearningSession(bundle, payload.planChecklist, brief);
    const existing = await TutoringSessionNote.findBySession(session.id, db);
    if (existing && (Number(existing.client_id) !== Number(subject.client_id) || Number(existing.agency_id) !== Number(subject.agency_id) || (existing.student_subject_id && Number(existing.student_subject_id) !== Number(subject.id)) || (payload.id && Number(existing.id) !== Number(payload.id)))) throw fail(409, 'This session note needs a record-link review. The saved content was kept.');
    if (payload.id && !existing) throw fail(409, 'The original note could not be found for this session. Reload before saving.');
    const prior = existing?.metadata_json || {};
    const oldChecklist = prior.planChecklist;
    if (existing && oldChecklist && JSON.stringify(oldChecklist) === JSON.stringify(checklist)) {
      if (!suppliedDb) await db.commit();
      return { note: existing, checklist, evidence: [], mastery: [], unchanged: true };
    }
    if (existing?.summary && !oldChecklist && payload.replaceExistingNote !== true) throw fail(409, 'Review the existing session note and confirm replacing it with the selected plan results. The original will be retained in note history.');
    const revision = Number(prior.checklistRevision || 0) + 1;
    const history = [...(Array.isArray(prior.documentationHistory) ? prior.documentationHistory : [])];
    if (existing) history.push({ savedAt: existing.updated_at || existing.saved_at || existing.created_at,
      savedByUserId: existing.saved_by_user_id || existing.updated_by_user_id || existing.created_by_user_id,
      summary: existing.summary, nextSteps: existing.next_steps, strengthsObserved: existing.strengths_observed,
      challengesObserved: existing.challenges_observed, homework: existing.homework, parentUpdateDraft: existing.parent_update_draft,
      checklist: oldChecklist || null, checklistRevision: prior.checklistRevision || null });
    const chips = checklist.areas.filter(area => area.score != null).map(area => ({
      planGoalId: area.planGoalId, planObjectiveId: area.planObjectiveId, skillKey: area.skillKey,
      skillLabel: area.title, rating: area.rating, scoreValue: area.score, notes: area.result || null,
      metadata: { documentationMode: 'learning_plan_checklist', checklistRevision: revision,
        planObjectiveId: area.planObjectiveId, strategies: area.strategies, nextStep: area.nextStep }
    }));
    const sessionType = ['in_person', 'virtual'].includes(session.delivery_context) ? session.delivery_context : ['in_person', 'virtual'].includes(payload.sessionType) ? payload.sessionType : null;
    const body = { sessionType, studentSubjectId: subject.id, learningPlanId: active.id, summary: checklist.summary, nextSteps: checklist.nextSteps,
      howItWent: { documentationMode: 'learning_plan_checklist', version: 1 }, evidenceChips: chips,
      // Previous prose remains in immutable history; it is not mixed into the new plan-only note.
      strengthsObserved: null, challengesObserved: null, homework: null, parentUpdateDraft: null,
      aiArtifactId: null, generalSupport: false, status: 'saved',
      metadata: { ...prior, documentationMode: 'learning_plan_checklist', checklistRevision: revision, planChecklist: checklist, documentationHistory: history } };
    const note = existing ? await TutoringSessionNote.update(existing.id, body, actorUserId, db)
      : await TutoringSessionNote.create({ ...body, agencyId: subject.agency_id, clientId: subject.client_id,
        studentSubjectId: subject.id, sessionId: session.id }, actorUserId, db);
    if (!session.student_subject_id) await db.execute('UPDATE learning_class_sessions SET student_subject_id=? WHERE id=? AND student_subject_id IS NULL', [subject.id, session.id]);
    const evidence = [];
    for (const chip of chips) evidence.push(await AcademicSkillEvidence.create({ ...chip, agencyId: subject.agency_id,
      clientId: subject.client_id, studentSubjectId: subject.id, learningPlanId: active.id,
      sessionId: session.id, sessionNoteId: note.id, recordedByUserId: actorUserId }, db));
    await clinicalAudit({ req, kind: 'tutoring', sessionId: session.id, agencyId: subject.agency_id, actor: `user-${actorUserId}` },
      'tutoring_learning_plan_results_saved', { noteId: note.id, learningPlanId: active.id, checklistRevision: revision,
        observedObjectives: chips.length, unobservedObjectives: checklist.areas.length - chips.length }, db);
    if (!suppliedDb) await db.commit();
    return { note, checklist, evidence, mastery: [] };
  } catch (error) {
    if (!suppliedDb) await db.rollback();
    throw error;
  } finally { if (!suppliedDb) db.release(); }
}
