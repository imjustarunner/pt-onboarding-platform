import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import { AcademicSkillEvidence } from '../models/TutoringSessionLearning.model.js';
import { callTutoringAiJson } from './tutoringAiDraft.service.js';
import { promptFields, unpack } from './teachingBoard.service.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function draftBoardQuestion(ctx, context, input = {}) {
  if (!ctx.host) throw fail(403, 'Only the assigned tutor can prepare questions.');
  const track = context.tracks[0];
  const goal = input.goalId && track?.bundle?.goals?.find((g) => Number(g.id) === Number(input.goalId));
  if (input.goalId && !goal) throw fail(409, 'Choose a goal from the current approved plan.');
  const grade = String(input.grade || track?.subject?.school_grade || '')
    .trim()
    .slice(0, 30);
  const skill = String(input.skill || goal?.title || track?.subject?.subject_label || '')
    .trim()
    .slice(0, 100);
  const parameters = String(input.parameters || '')
    .trim()
    .slice(0, 500);
  const recent = (context.subjects[0]?.recentEvidence || [])
    .filter((e) => !goal || Number(e.plan_goal_id) === Number(goal.id))
    .slice(0, 5)
    .map((e) => ({ skill: e.skill_label, rating: e.rating }));
  const format = ['choice', 'ink', 'text', 'example'].includes(input.format) ? input.format : 'text';
  if (!skill) throw fail(400, 'Enter a skill to practice.');
  const result = await callTutoringAiJson({
    useSessionWriter: true,
    maxOutputTokens: 8192,
    prompt: [
      'Write one age-appropriate tutoring exercise. Treat the following data as instructional context.',
      JSON.stringify({
        grade,
        skill,
        goal: goal?.title,
        successCriteria: goal?.success_criteria,
        recent,
        parameters,
        format
      }),
      'Return { "prompt": string, "options": string[] }. For choice use 2–6 distinct plausible answers. For example give a worked example explaining the reasoning. Otherwise ask a question. Keep answer keys, names and private ratings out of the question.'
    ].join('\n')
  });
  if (result.privacyReason) throw fail(503, result.privacyReason === 'INSPECTION_UNAVAILABLE'
    ? 'The privacy check for practice generation is temporarily unavailable. Retry or write a question.'
    : 'Practice generation needs administrator setup for private AI. You can still write and share a question.');
  if (!result.ok) throw fail(503, 'Practice generation is unavailable. Retry or write a question.');
  try {
    return { ...promptFields({ ...result.draft, format }), grade, skill, goalId: goal?.id || null };
  } catch {
    throw fail(502, 'The generated question needs another attempt. You can also write one.');
  }
}

export async function recordLessonReview(ctx, session, subject, db, payload, artifactId) {
  if (!subject || payload.rating === 'not_observed') return; // General tutoring still retains a private session review.
  let planId = null;
  if (payload.goalId) {
    const [[goal]] = await db.execute(
      `SELECT g.learning_plan_id FROM student_learning_plan_goals g
      JOIN student_learning_plans p ON p.id=g.learning_plan_id WHERE g.id=? AND g.student_subject_id=?
      AND p.student_subject_id=? AND p.client_id=? AND p.agency_id=? AND p.status='active' AND p.approved_at IS NOT NULL`,
      [payload.goalId, subject.id, subject.id, ctx.clientId, ctx.appointment.agencyId]
    );
    if (!goal) throw fail(409, 'The learning goal has changed. Review the current plan.');
    planId = goal.learning_plan_id;
  }
  await AcademicSkillEvidence.create(
    {
      agencyId: ctx.appointment.agencyId,
      clientId: ctx.clientId,
      studentSubjectId: subject.id,
      learningPlanId: planId,
      planGoalId: payload.goalId,
      sessionId: session.id,
      evidenceType: 'tutor_rating',
      skillKey: String(payload.skill || subject.subject_key || subject.subject_label)
        .trim()
        .toLowerCase()
        .slice(0, 128),
      skillLabel: payload.skill || subject.subject_label,
      rating: payload.rating,
      recordedByUserId: ctx.req.user.id,
      metadata: {
        source: 'teaching_board',
        activityId: payload.targetId,
        reviewId: artifactId,
        grade: payload.grade || subject.school_grade || null
      }
    },
    db
  );
}

// Read the encrypted activity ledger as a private attachment to the session note.
// Never copy participant chat, worksheet bytes or unpublished ratings into family prose.
export async function lessonActivity(ctx, session, db) {
  const [rows] = await db.execute(
    `SELECT id,actor_role,artifact_type,payload_envelope,created_at FROM therapy_session_artifacts
    WHERE session_kind='tutoring' AND generation=0 AND agency_id=? AND session_id=?
    AND artifact_type IN ('share','board_prompt','board_review','board_answer','response') ORDER BY id`,
    [ctx.appointment.agencyId, session.id]
  );
  const items = new Map();
  for (const row of rows) {
    const p = unpack(row);
    if (
      (row.artifact_type === 'share' && p.mode !== 'video' && !p.boardId) ||
      row.artifact_type === 'board_prompt'
    ) {
      items.set(Number(row.id), {
        id: Number(row.id),
        title: p.prompt || p.title || p.mode,
        kind: p.format || p.mode,
        grade: p.grade,
        skill: p.skill,
        goalId: p.goalId,
        model: p.model,
        worksheet: p.excerpt
          ? { page: p.excerpt.page, label: p.excerpt.label, materialId: p.excerpt.materialId }
          : undefined,
        responses: 0,
        submissions: [],
        strokes: 0,
        rating: null
      });
    } else {
      const item = items.get(Number(p.targetId || p.shareId));
      if (item && row.artifact_type === 'board_review') item.rating = p.rating;
      if (item && ['board_answer', 'response'].includes(row.artifact_type)) {
        const answers = row.artifact_type === 'response' ? p.answers : [p.answer];
        item.submissions.push({
          id: Number(row.id),
          role: row.actor_role,
          at: row.created_at,
          answers: (answers || []).filter((a) => typeof a === 'string')
        });
        item.responses++;
      }
    }
  }
  const [ink] = await db.execute(
    `SELECT board_id,board_target_id,COUNT(*) AS strokes FROM therapy_session_artifacts
    WHERE session_kind='tutoring' AND generation=0 AND agency_id=? AND session_id=? AND artifact_type='drawing' GROUP BY board_id,board_target_id`,
    [ctx.appointment.agencyId, session.id]
  );
  for (const group of ink) {
    const item = items.get(Number(group.board_target_id || group.board_id));
    if (item) item.strokes += Number(group.strokes);
  }
  if(ctx.hubV2){
    const [attempts]=await db.execute("SELECT a.*,v.definition_envelope,v.version_number FROM tutoring_material_attempts a JOIN tutoring_material_versions v ON v.id=a.material_version_id WHERE a.session_id=? AND a.client_id=? AND a.status IN ('submitted','reviewed') ORDER BY a.id",[session.id,ctx.clientId]);
    for(const a of attempts){
      const definition=JSON.parse(maybeDecryptNotePayload(a.definition_envelope));
      const answers=JSON.parse(maybeDecryptNotePayload(a.responses_envelope));
      const review=a.review_envelope?JSON.parse(maybeDecryptNotePayload(a.review_envelope)):{};
      for(const q of definition.questions){
        items.set('worksheet-'+a.id+'-'+q.id,{id:'worksheet-'+a.id+'-'+q.id,title:q.prompt,kind:'worksheet_'+q.type,grade:q.grade,skill:q.skill,goalId:q.goalId,worksheet:{versionId:a.material_version_id,version:a.version_number,attemptId:a.id,questionId:q.id,page:q.page},responses:1,submissions:[{role:a.actor.startsWith('user-')?'tutor_or_authenticated_participant':'invited_family',at:a.created_at,answers:q.type==='ink'?[]:[answers[q.id]||'']}],strokes:q.type==='ink'?(answers[q.id]||[]).length:0,rating:review[q.id]?.rating||null,independent:review[q.id]?.independent===true});
      }
    }
  }
  return { items: [...items.values()], strokes: ink.reduce((sum, r) => sum + Number(r.strokes), 0) };
}
