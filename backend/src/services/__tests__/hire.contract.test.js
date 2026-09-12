import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), preview: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../contractMerge.service.js', () => ({
  autofillTokensForCandidate: vi.fn(async () => ({ EMPLOYEE_FULL_NAME: 'New Employee' })),
  renderContractHtml: mocks.preview, getAgencyBuilderDefaults: vi.fn(), inferCompensationFromCredential: vi.fn()
}));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: {}, COMPENSATION_CATEGORIES: [] }));
import { generateAndAssignCandidateContract } from '../contractGenerator.service.js';
const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
const request = { agencyId: 1, candidateUserId: 2, configId: 3, createdByUserId: 4 };
beforeEach(() => { vi.clearAllMocks(); mocks.getConnection.mockResolvedValue(db); mocks.preview.mockResolvedValue({ html: '<p>Agreement</p>', unresolvedTokens: [] }); });
function setup({ existing = [], failGeneration = false } = {}) {
  mocks.execute.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT status')) return [[{ status: 'PREHIRE_OPEN' }]];
    if (sql.startsWith('SELECT user_id')) return [[{ user_id: 2 }]];
    if (sql.startsWith('SELECT g.*')) return [existing];
    if (sql.startsWith('SELECT * FROM tasks')) return [[{ id: 10 }]];
    if (sql.startsWith('INSERT INTO contract_generations') && failGeneration) throw new Error('failed generation');
    return [{ insertId: 10 }];
  });
}
describe('contract assignment consistency', () => {
  it('rejects unresolved tokens before creating any documents', async () => {
    mocks.preview.mockResolvedValue({ html: '{{MISSING}}', unresolvedTokens: ['MISSING'] });
    await expect(generateAndAssignCandidateContract(request)).rejects.toThrow('MISSING');
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('returns the existing generation for an identical retry', async () => {
    setup({ existing: [{ id: 7, task_id: 10, rendered_html: '<p>Agreement</p>', task_status: 'pending' }] });
    expect(await generateAndAssignCandidateContract(request)).toMatchObject({ reused: true, generationId: 7, html: '<p>Agreement</p>' });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('preserves a signed agreement when compensation changes', async () => {
    setup({ existing: [{ id: 7, task_id: 10, rendered_html: 'old rates', task_status: 'completed' }] });
    await expect(generateAndAssignCandidateContract(request)).rejects.toThrow('already signed');
    expect(db.rollback).toHaveBeenCalled();
  });
  it('supersedes an unsigned prior generation after creating the replacement', async () => {
    setup({ existing: [{ id: 7, task_id: 9, rendered_html: 'old rates', task_status: 'pending' }] });
    expect(await generateAndAssignCandidateContract(request)).toMatchObject({ replacedCount: 1, generationId: 10 });
    expect(mocks.execute.mock.calls.find(([sql]) => sql.includes("SET status = 'overridden'"))[1]).toEqual([9]);
    expect(db.commit).toHaveBeenCalled();
  });
  it('rolls back document and task together if generation persistence fails', async () => {
    setup({ failGeneration: true }); await expect(generateAndAssignCandidateContract(request)).rejects.toThrow('failed generation');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled(); expect(db.release).toHaveBeenCalled();
  });
});
