import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: u => ({ canManageHiring: u.role === 'admin' }) }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { trainingScope, trainingRecordAccess, listTrainingEvaluations, getTrainingEvaluation, createTrainingEvaluation, saveTrainingEvaluation } from '../studentTrainingEvaluation.service.js';
import { studentTrainingTemplate, validateTrainingResponse } from '../studentTrainingEvaluationForm.js';
import { requestLoggingMiddleware } from '../../middleware/requestLogging.middleware.js';

const template = studentTrainingTemplate();
const response = score => ({ scores: Object.fromEntries(template.sections.map(s => [s.key, score ?? s.maxPoints])), notes: {}, summary: '', nextSteps: '' });
const manager = { agencyId: 2, userId: 4, manage: true };
const supervisor = { agencyId: 2, userId: 4, manage: false };
let row, conn;
beforeEach(() => {
  vi.resetAllMocks();
  row = { id: 9, agency_id: 2, student_user_id: 10, evaluator_user_id: 4, period_year: 2026, period_quarter: 4, status: 'draft', revision: 1, template_snapshot_json: JSON.stringify(template), response_json: JSON.stringify({ scores: {}, notes: {} }) };
  conn = { execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT * FROM student_training')) return [[row]];
    if (sql.startsWith('SELECT u.id')) return [[{ id: 10 }]];
    if (sql.includes('supervisor_assignments')) return [[{ id: 3 }]];
    return [{ insertId: 9, affectedRows: 1 }];
  }), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  pool.execute.mockImplementation(async sql => sql.includes('supervisor_assignments') ? [[{ id: 3 }]] : sql.includes('FROM agencies') ? [[{ id: 2, slug: 'itsco' }]] : [[row]]);
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
});

describe('student evaluation scoring', () => {
  it('distinguishes an incomplete draft from all-zero scores and computes the full score', () => {
    expect(validateTrainingResponse(template, { scores: {}, notes: {} }).total).toBeNull();
    expect(validateTrainingResponse(template, response(0), { complete: true })).toMatchObject({ total: 0, outcome: 'Unsatisfactory' });
    expect(validateTrainingResponse(template, response(), { complete: true })).toMatchObject({ total: 100, outcome: 'Excellent' });
    expect(() => validateTrainingResponse(template, { scores: {}, notes: {} }, { complete: true })).toThrow('Enter a score');
  });
  it.each([-1, 21, 0.5, '10', true])('rejects invalid first-category score %s', value => {
    const input = response(); input.scores[template.sections[0].key] = value;
    expect(() => validateTrainingResponse(template, input)).toThrow('whole number');
  });
  it('rejects unknown categories and oversized notes', () => {
    expect(() => validateTrainingResponse(template, { ...response(), scores: { other: 10 } })).toThrow('unknown');
    expect(() => validateTrainingResponse(template, { ...response(), summary: 'x'.repeat(4001) })).toThrow('4,000');
  });
});

describe('private evaluation access', () => {
  it.each(['nlu', 'tisi', 'innerstrength'])('supports %s students with the same tenant and supervisor access checks', async slug => {
    pool.execute.mockResolvedValue([[{ id: 2, slug }]]);
    expect(await trainingScope({ id: 4, role: 'admin' }, 2)).toMatchObject({ agencyId: 2, userId: 4 });
    await expect(trainingScope({ id: 4, role: 'admin' }, 3)).rejects.toMatchObject({ status: 403 });
  });
  it('checks membership before tenant content and rejects other tenant forms', async () => {
    await expect(trainingScope({ id: 4, role: 'admin' }, 3)).rejects.toMatchObject({ status: 403 });
    expect(pool.execute).not.toHaveBeenCalled();
    pool.execute.mockResolvedValue([[{ id: 2, slug: 'another-agency' }]]);
    await expect(trainingScope({ id: 4, role: 'admin' }, 2)).rejects.toMatchObject({ status: 404 });
  });
  it('limits interns to their own submitted records', async () => {
    const intern = { agencyId: 2, userId: 10, manage: false };
    await expect(trainingRecordAccess(intern, row)).rejects.toMatchObject({ status: 403 });
    expect(await trainingRecordAccess(intern, { ...row, status: 'submitted' })).toEqual({ canEdit: false });
    await expect(trainingRecordAccess({ ...intern, userId: 11 }, { ...row, status: 'submitted' })).rejects.toMatchObject({ status: 403 });
    await expect(trainingRecordAccess(manager, { ...row, agency_id: 3 })).rejects.toMatchObject({ status: 404 });
    expect(await trainingRecordAccess({ ...manager, userId: 10 }, row)).toEqual({ canEdit: false });
  });
  it('requires the author to remain an assigned clinical supervisor', async () => {
    expect(await trainingRecordAccess(supervisor, row)).toEqual({ canEdit: true });
    pool.execute.mockResolvedValue([[]]);
    await expect(trainingRecordAccess(supervisor, row)).rejects.toMatchObject({ status: 403 });
    await expect(getTrainingEvaluation(manager, 99)).rejects.toMatchObject({ status: 404 });
  });
  it('scopes list queries and excludes response bodies from lists', async () => {
    pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[row]]);
    const result = await listTrainingEvaluations({ agencyId: 2, userId: 10, manage: false });
    const [sql, params] = pool.execute.mock.calls[1];
    expect(params).toEqual([2, 0, 10, 10, 10]);
    expect(sql).toContain("e.status = 'submitted'");
    expect(sql).toContain("sa.supervisor_type = 'clinical'");
    expect(sql).not.toContain('e.*');
    expect(result.evaluations[0]).not.toHaveProperty('response_json');
  });
  it('redacts scores and notes from request logs', () => {
    const req = { path: '/api/evaluations/student-training/9/submit', body: { response: response(), privateNote: 'Private' } };
    requestLoggingMiddleware(req, {}, vi.fn());
    expect(req.sanitizedBody).toBe('[PRIVATE STUDENT EVALUATION]');
  });
});

describe('transactional evaluation records', () => {
  it('saves drafts against a snapshot and calculates totals server-side', async () => {
    await saveTrainingEvaluation(manager, 9, { revision: 1, response: { scores: {}, notes: {}, summary: ' Continue later ' }, total: 100 });
    const update = conn.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[1];
    expect(update.slice(1, 4)).toEqual([null, null, 'draft']);
    expect(JSON.parse(update[0]).summary).toBe('Continue later');
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.execute.mock.calls.some(([sql, args]) => sql.includes('evaluation_activity') && args[2] === 'draft_saved')).toBe(true);
  });
  it('submits with calculated total, actor, time and audit event', async () => {
    await saveTrainingEvaluation(manager, 9, { revision: 1, response: response(), total: -100 }, { submit: true });
    const update = conn.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[1];
    expect(update.slice(1, 5)).toEqual([100, 'Excellent', 'submitted', 4]);
    expect(update[5]).toBeInstanceOf(Date);
    expect(conn.execute.mock.calls.some(([sql, args]) => sql.includes('evaluation_activity') && args[2] === 'submitted' && args[3] === 2)).toBe(true);
  });
  it.each(['stale', 'submitted', 'missing score', 'other tenant'])('rejects %s saves without writing', async reason => {
    if (reason === 'stale') row.revision = 2;
    if (reason === 'submitted') row.status = 'submitted';
    if (reason === 'other tenant') row.agency_id = 3;
    await expect(saveTrainingEvaluation(manager, 9, { revision: 1, response: reason === 'missing score' ? { scores: {}, notes: {} } : response() }, { submit: true })).rejects.toBeDefined();
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });
  it('creates only for active interns and snapshots the actual rubric', async () => {
    await createTrainingEvaluation(supervisor, { studentUserId: 10, year: 2026, quarter: 4, template: {} });
    const [sql, args] = conn.execute.mock.calls.find(([s]) => s.startsWith('INSERT INTO student_training_evaluations '));
    expect(JSON.parse(args[5])).toEqual(template);
    expect(sql).toContain('template_snapshot_json');
    expect(conn.execute.mock.calls.find(([s]) => s.startsWith('SELECT u.id'))[0]).toContain("employment_type = 'intern'");
    await expect(createTrainingEvaluation(manager, { studentUserId: 4, year: 2026, quarter: 4 })).rejects.toMatchObject({ status: 403 });
  });
  it('rejects duplicate quarters and rolls back the whole transaction', async () => {
    const original = conn.execute.getMockImplementation();
    conn.execute.mockImplementation((sql, args) => sql.startsWith('INSERT INTO student_training_evaluations ') ? Promise.reject(Object.assign(new Error(), { code: 'ER_DUP_ENTRY' })) : original(sql, args));
    await expect(createTrainingEvaluation(manager, { studentUserId: 10, year: 2026, quarter: 4 })).rejects.toMatchObject({ status: 409 });
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it('rolls back a save if its audit write fails', async () => {
    const original = conn.execute.getMockImplementation();
    conn.execute.mockImplementation((sql, args) => sql.includes('INSERT INTO student_training_evaluation_activity') ? Promise.reject(new Error('Storage failed')) : original(sql, args));
    await expect(saveTrainingEvaluation(manager, 9, { revision: 1, response: response() })).rejects.toThrow('Storage failed');
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});
