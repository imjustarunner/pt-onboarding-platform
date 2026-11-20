import { beforeEach, expect, it, vi } from 'vitest';
import {
  draftBoardQuestion,
  recordLessonReview,
  lessonActivity
} from '../tutoringBoardLesson.service.js';
import { lessonMeasures, boardSkillProgress } from '../../utils/tutoringBoardProgress.js';
import { AcademicSkillEvidence } from '../../models/TutoringSessionLearning.model.js';
import { callTutoringAiJson } from '../tutoringAiDraft.service.js';

vi.mock('../tutoringAiDraft.service.js', () => ({ callTutoringAiJson: vi.fn() }));
vi.mock('../../models/TutoringSessionLearning.model.js', () => ({
  AcademicSkillEvidence: { create: vi.fn() }
}));
vi.mock('../chatEncryption.service.js', () => ({ decryptChatText: (value) => value.text }));
const subject = { id: 8, subject_label: 'Math', school_grade: '5' };
const ctx = { host: true, clientId: 22, appointment: { agencyId: 453 }, req: { user: { id: 5 } } };
const goal = { id: 17, title: 'Equivalent fractions', success_criteria: 'Explain equal parts' };
const context = {
  tracks: [{ subject, bundle: { goals: [goal] } }],
  subjects: [
    {
      recentEvidence: [
        { plan_goal_id: 17, skill_label: 'Fractions', rating: 'developing', notes: 'private narrative' },
        { plan_goal_id: 19, skill_label: 'Other goal', rating: 'secure' }
      ]
    }
  ]
};
beforeEach(() => vi.clearAllMocks());
it('drafts using the selected grade, reviewed goal, relevant observations and tutor parameters', async () => {
  callTutoringAiJson.mockResolvedValue({
    ok: true,
    draft: { prompt: 'Which equals one half?', options: ['2/4', '3/4'], key: '2/4' }
  });
  const draft = await draftBoardQuestion(ctx, context, {
    goalId: 17,
    parameters: 'Use a tape diagram',
    format: 'choice'
  });
  expect(draft).toMatchObject({
    format: 'choice',
    grade: '5',
    skill: goal.title,
    options: ['2/4', '3/4']
  });
  expect(draft).not.toHaveProperty('key');
  const prompt = callTutoringAiJson.mock.calls[0][0].prompt;
  for (const value of [
    'Equivalent fractions',
    'Explain equal parts',
    'developing',
    'Use a tape diagram'
  ])
    expect(prompt).toContain(value);
  for (const value of ['private narrative', 'Other goal']) expect(prompt).not.toContain(value);
  expect(AcademicSkillEvidence.create).not.toHaveBeenCalled();
});
it('keeps unavailable generation, malformed output and obsolete goals out of the board', async () => {
  await expect(draftBoardQuestion({ ...ctx, host: false }, context, {})).rejects.toMatchObject({
    status: 403
  });
  await expect(draftBoardQuestion(ctx, context, { goalId: 999 })).rejects.toMatchObject({ status: 409 });
  callTutoringAiJson
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, draft: { prompt: 'Question', options: ['same', 'same'] } });
  await expect(draftBoardQuestion(ctx, context, {})).rejects.toMatchObject({ status: 503 });
  await expect(draftBoardQuestion(ctx, context, { format: 'choice' })).rejects.toMatchObject({
    status: 502
  });
});
it('writes evidence with its actual tutor, session, activity, grade and approved goal', async () => {
  const db = { execute: vi.fn(async () => [[{ learning_plan_id: 2 }]]) };
  const payload = {
    targetId: 10,
    goalId: 17,
    skill: 'Equivalent fractions',
    grade: '5',
    rating: 'secure'
  };
  await recordLessonReview(ctx, { id: 3 }, subject, db, payload, 23);
  expect(db.execute.mock.calls[0][1]).toEqual([17, 8, 8, 22, 453]);
  expect(AcademicSkillEvidence.create).toHaveBeenCalledWith(
    expect.objectContaining({
      recordedByUserId: 5,
      sessionId: 3,
      agencyId: 453,
      learningPlanId: 2,
      planGoalId: 17,
      metadata: { source: 'teaching_board', activityId: 10, reviewId: 23, grade: '5' }
    }),
    db
  );
  await recordLessonReview(ctx, { id: 3 }, subject, db, { ...payload, rating: 'not_observed' }, 24);
  await recordLessonReview(ctx, { id: 3 }, null, db, payload, 25);
  expect(AcademicSkillEvidence.create).toHaveBeenCalledTimes(1);
  db.execute.mockResolvedValue([[]]);
  await expect(recordLessonReview(ctx, { id: 3 }, subject, db, payload, 26)).rejects.toMatchObject({
    status: 409
  });
});
it('counts practice in one appointment once and compares the same skill and grade', () => {
  const row = (id, sessionId, rating, grade = '5') => ({
    id,
    session_id: sessionId,
    rating,
    skill_key: 'fractions',
    skill_label: 'Fractions',
    plan_goal_id: 17,
    student_subject_id: 8,
    metadata_json: { source: 'teaching_board', grade }
  });
  const rows = [
    row(4, 12, 'secure'),
    row(3, 12, 'developing'),
    row(2, 11, 'secure'),
    row(1, 10, 'secure', '4')
  ];
  expect(boardSkillProgress(rows)).toMatchObject([
    { grade: '5', sessions: 2, independent: 1, latest: 'developing', previous: 'secure' },
    { grade: '4', sessions: 1, independent: 1 }
  ]);
  expect(lessonMeasures(rows).map((r) => r.id)).toEqual([3, 2, 1]);
});
it('documents each original shared activity, responses and observations once across page changes', async () => {
  const row = (id, artifact_type, p) => ({
    id,
    artifact_type,
    payload_envelope: JSON.stringify({ text: JSON.stringify(p) })
  });
  const db = {
    execute: vi
      .fn()
      .mockResolvedValueOnce([
        [
          row(1, 'share', { mode: 'whiteboard', title: 'Model' }),
          row(2, 'board_prompt', { format: 'text', prompt: 'Explain', skill: 'Fractions' }),
          row(3, 'board_answer', { targetId: 2, answer: 'My explanation' }),
          row(4, 'board_review', { targetId: 2, rating: 'developing' }),
          row(5, 'share', { mode: 'whiteboard', boardId: 1 }),
          row(6, 'share', { mode: 'pdf', title: 'Practice', document: 'private bytes' })
        ]
      ])
      .mockResolvedValueOnce([[{ board_id: 1, board_target_id: 2, strokes: 2 }]])
  };
  const result = await lessonActivity(ctx, { id: 99 }, db);
  expect(result.strokes).toBe(2);
  expect(result.items.map((i) => i.id)).toEqual([1, 2, 6]);
  expect(result.items[1]).toMatchObject({
    responses: 1,
    strokes: 2,
    submissions: [{ id: 3, answers: ['My explanation'] }],
    rating: 'developing'
  });
  expect(JSON.stringify(result)).not.toContain('private bytes');
});
