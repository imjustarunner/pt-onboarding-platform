import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { AcademicSkillEvidence, TutoringSessionNote } from '../TutoringSessionLearning.model.js';
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockImplementation(async sql => sql.startsWith('INSERT') ? [{ insertId: 5 }] : [[{ id: 5 }]]); });
describe('session evidence persistence', () => {
 it('records who saved the first checklist and uses the supplied transaction for its read', async () => {
  const db = { execute: vi.fn(async sql => sql.startsWith('INSERT') ? [{ insertId: 5 }] : [[{ id: 5 }]]) };
  await TutoringSessionNote.create({ agencyId: 2, clientId: 4, studentSubjectId: 8, sessionId: 9, status: 'saved', summary: 'Recorded result' }, 100, db);
  const [sql, params] = db.execute.mock.calls[0];
  expect(sql).toContain('saved_at, saved_by_user_id');
  expect((sql.match(/\?/g) || []).length).toBe(params.length);
  expect(params.slice(-2)).toEqual([1, 100]);
  expect(pool.execute).not.toHaveBeenCalled();
 });
 it('keeps unsaved drafts separate from recorded session notes', async () => {
  await TutoringSessionNote.create({ agencyId: 2, clientId: 4, studentSubjectId: 8, status: 'draft' }, 100);
  expect(pool.execute.mock.calls[0][1].slice(-2)).toEqual([0, null]);
 });
 it('retains evidence history but excludes earlier revisions from current progress reads', async () => {
  await AcademicSkillEvidence.listBySubject(8); await AcademicSkillEvidence.listByGoal(91); await AcademicSkillEvidence.progressChart(8);
  for (const [sql] of pool.execute.mock.calls) {
   expect(sql).toContain("'$.checklistRevision'"); expect(sql).toContain('current_note.id = academic_skill_evidence.session_note_id');
  }
  expect(pool.execute.mock.calls.every(([sql]) => !/DELETE|UPDATE/.test(sql))).toBe(true);
 });
});
