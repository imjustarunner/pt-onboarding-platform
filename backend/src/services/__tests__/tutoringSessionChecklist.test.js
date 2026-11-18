import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../models/StudentLearningPlan.model.js', () => ({ default: { findActiveBySubject: vi.fn(), getPlanBundle: vi.fn() } }));
vi.mock('../../models/TutoringSessionLearning.model.js', () => ({ AcademicSkillEvidence: { create: vi.fn() }, TutoringSessionBrief: { findBySession: vi.fn(async()=>null) }, TutoringSessionNote: { findBySession: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock('../clinicalSessionAudit.service.js', () => ({ clinicalAudit: vi.fn() }));
import pool from '../../config/database.js';
import StudentLearningPlan from '../../models/StudentLearningPlan.model.js';
import { AcademicSkillEvidence, TutoringSessionNote, TutoringSessionBrief } from '../../models/TutoringSessionLearning.model.js';
import { saveLearningPlanSessionNote } from '../tutoringSessionChecklist.service.js';
import { assembleLearningSession, checklistMasteryReview } from '../../../../frontend/src/navigation/tutoringSessionDocumentation.js';
import { bundle, planChecklist, brief } from '../../../../frontend/previews/learning-session/fixture.js';
const subject = { id: 18, agency_id: 90002, client_id: 90004, primary_tutor_user_id: 100 };
const payload = () => ({ documentationMode: 'learning_plan_checklist', studentSubjectId: 18, learningPlanId: 801, sessionId: 1001, planChecklist: structuredClone(planChecklist) });
let db, stored, nextId;
beforeEach(() => {
  vi.clearAllMocks(); TutoringSessionBrief.findBySession.mockResolvedValue(null); stored = null; nextId = 1;
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => sql.includes('FROM learning_class_sessions') ? [[{ id: 1001, organization_id: 90002, provider_user_id: 100, student_subject_id: 18 }]] : [[{ client_id: 90004 }]]) };
  pool.getConnection.mockResolvedValue(db);
  StudentLearningPlan.findActiveBySubject.mockResolvedValue(bundle.plan);
  StudentLearningPlan.getPlanBundle.mockResolvedValue(bundle);
  TutoringSessionNote.findBySession.mockImplementation(async () => stored);
  const persist = async body => (stored = { id: 5, agency_id: 90002, client_id: 90004, student_subject_id: 18, session_id: 1001, learning_plan_id: 801, summary: body.summary, next_steps: body.nextSteps, metadata_json: body.metadata });
  TutoringSessionNote.create.mockImplementation(persist);
  TutoringSessionNote.update.mockImplementation(async (_id, body) => persist(body));
  AcademicSkillEvidence.create.mockImplementation(async body => ({ id: nextId++, ...body }));
});
describe('plan-only tutoring documentation', () => {
  it('assembles concise text solely from selected plan areas, actual strategies and recorded results', () => {
    const output = assembleLearningSession(bundle, planChecklist);
    expect(output.summary).toContain('Compare decimals to hundredths: 3/4 — mostly independent');
    expect(output.summary).toContain('6 of 8 correct; two tutor prompts');
    expect(output.summary).toContain('Next: move forward.');
    expect(output.summary).not.toContain('Add decimals');
    expect(output.summary).not.toMatch(/improv|diagnos|mastered|prior session/i);
  });
  it.each([['emerging', 'Revisit'], ['developing', 'Revisit'], ['nearly_secure', 'Move forward'], ['secure', 'Move forward']])('%s uses the confirmed next-focus scale', (rating, nextStep) => {
    const input = structuredClone(planChecklist); input.areas[0].rating = rating;
    expect(assembleLearningSession(bundle, input).areas[0].nextStep).toBe(nextStep);
  });
  it('does not default a performance rating', () => {
    const input = structuredClone(planChecklist); input.areas[0].rating = '';
    expect(() => assembleLearningSession(bundle, input)).toThrow('Choose a performance rating');
  });
  it('rejects foreign objectives, duplicate selections and invented strategies', () => {
    expect(() => assembleLearningSession(bundle, { areas: [{ key: 'objective:999', rating: 'secure' }] })).toThrow('no longer belongs');
    expect(() => assembleLearningSession(bundle, { areas: [...planChecklist.areas, ...planChecklist.areas] })).toThrow('only once');
    const input = structuredClone(planChecklist); input.areas[0].strategyKeys = ['99'];
    expect(() => assembleLearningSession(bundle, input)).toThrow('strategy no longer belongs');
  });
  it('saves evidence without any AI import, mastery change, family report or practice assignment', async () => {
    const result = await saveLearningPlanSessionNote(payload(), 100, { subject });
    expect(result).toMatchObject({ mastery: [], note: { summary: expect.stringContaining('3/4') } });
    expect(result).not.toHaveProperty('practiceAssignment'); expect(result).not.toHaveProperty('report');
    expect(AcademicSkillEvidence.create).toHaveBeenCalledWith(expect.objectContaining({ planGoalId: 91, recordedByUserId: 100, metadata: expect.objectContaining({ planObjectiveId: 911, checklistRevision: 1 }) }), db);
    expect(TutoringSessionNote.create.mock.calls[0][0]).not.toHaveProperty('attendanceStatus');
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('keeps an unobserved objective from becoming negative or positive evidence', async () => {
    const input = payload(); input.planChecklist.areas = [{ key: 'objective:911', rating: 'not_observed' }];
    const result = await saveLearningPlanSessionNote(input, 100, { subject });
    expect(result.note.summary).toContain('not observed; progress not assessed');
    expect(AcademicSkillEvidence.create).not.toHaveBeenCalled();
  });
  it('rejects contradictory results on an unobserved objective', () => {
    const input = structuredClone(planChecklist); input.areas[0].rating = 'not_observed';
    expect(() => assembleLearningSession(bundle, input)).toThrow('unobserved objective cannot');
  });
  it('is idempotent on repeated save and appends history on an edited rating', async () => {
    await saveLearningPlanSessionNote(payload(), 100, { subject });
    const second = await saveLearningPlanSessionNote(payload(), 100, { subject });
    expect(second.unchanged).toBe(true); expect(TutoringSessionNote.create).toHaveBeenCalledOnce(); expect(AcademicSkillEvidence.create).toHaveBeenCalledOnce();
    const edited = payload(); edited.planChecklist.areas[0].rating = 'developing';
    const third = await saveLearningPlanSessionNote(edited, 100, { subject });
    expect(third.note.metadata_json.checklistRevision).toBe(2);
    expect(third.note.metadata_json.documentationHistory[0].summary).toContain('3/4');
    expect(third.note.summary).toContain('Next: revisit');
  });
  it('requires review to replace an old manual note and retains the source', async () => {
    stored = { id: 5, agency_id: 90002, client_id: 90004, summary: 'Original observation', homework: 'Original homework', metadata_json: {} };
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toMatchObject({ status: 409 });
    const result = await saveLearningPlanSessionNote({ ...payload(), replaceExistingNote: true }, 100, { subject });
    expect(result.note.metadata_json.documentationHistory[0]).toMatchObject({ summary: 'Original observation' });
  });
  it.each(['client', 'agency', 'subject'])('rejects a %s mismatch in the approved plan', async mismatch => {
    const plan = structuredClone(bundle); plan.plan[`${mismatch === 'subject' ? 'student_subject' : mismatch}_id`] = 999;
    StudentLearningPlan.getPlanBundle.mockResolvedValue(plan);
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toMatchObject({ status: 409 });
    expect(TutoringSessionNote.create).not.toHaveBeenCalled();
  });
  it('rejects an obsolete or unapproved plan', async () => {
    await expect(saveLearningPlanSessionNote({ ...payload(), learningPlanId: 999 }, 100, { subject })).rejects.toMatchObject({ status: 409 });
    StudentLearningPlan.getPlanBundle.mockResolvedValue({ ...bundle, plan: { ...bundle.plan, approved_at: null } });
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toMatchObject({ status: 409 });
  });
  it('does not modify a foreign existing note ID or a session with another roster', async () => {
    stored = { id: 6, agency_id: 90002, client_id: 90005 };
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toMatchObject({ status: 409 });
    db.execute.mockResolvedValue([[]]);
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toMatchObject({ status: 403 });
    expect(AcademicSkillEvidence.create).not.toHaveBeenCalled();
  });
  it('rolls back a failed evidence save instead of leaving a partial session record', async () => {
    AcademicSkillEvidence.create.mockRejectedValue(new Error('Synthetic write failure'));
    await expect(saveLearningPlanSessionNote(payload(), 100, { subject })).rejects.toThrow('Synthetic write failure');
    expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled();
  });
  it('does not count several objectives from one session as independent mastery checks', () => {
    const evidence = [1, 2, 3].map(id => ({ id, session_id: 1001, rating: 'secure', metadata_json: { documentationMode: 'learning_plan_checklist' } }));
    expect(checklistMasteryReview(91, evidence)).toMatchObject({ measureCount: 1, recommendedStatus: null, requiresPlanCriteriaReview: true });
    expect(checklistMasteryReview(91, [{ id: 1, rating: 'secure' }])).toBeNull();
  });

  it('takes the setting from the scheduled session rather than the submitted label', async () => {
    db.execute.mockImplementation(async sql => sql.includes('FROM learning_class_sessions') ? [[{ id: 1001, organization_id: 90002, provider_user_id: 100, student_subject_id: 18, delivery_context: 'in_person' }]] : [[{ client_id: 90004 }]]);
    await saveLearningPlanSessionNote({ ...payload(), sessionType: 'virtual' }, 100, { subject });
    expect(TutoringSessionNote.create.mock.calls[0][0].sessionType).toBe('in_person');
  });

  it('uses actual matching session-brief focuses and strategies while rejecting stale or foreign brief selections', async () => {
    TutoringSessionBrief.findBySession.mockResolvedValue(brief);
    const input = payload(); input.planChecklist.areas = [{ key: 'activity:701:1', rating: 'developing', strategyKeys: ['brief:701:0'], result: 'Observed guided practice' }];
    const result = await saveLearningPlanSessionNote(input,100,{subject});
    expect(result.note.summary).toContain('Guided word-problem practice: 2/4');
    expect(result.note.summary).toContain('Think-aloud modeling');
    TutoringSessionBrief.findBySession.mockResolvedValue({...brief,client_id:999});
    await expect(saveLearningPlanSessionNote(input,100,{subject})).rejects.toThrow('no longer belongs');
  });

});
