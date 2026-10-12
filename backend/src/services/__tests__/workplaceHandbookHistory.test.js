import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../workplaceHandbook.service.js', () => ({ getDigest: vi.fn() }));
import pool from '../../config/database.js';
import { getDigest } from '../workplaceHandbook.service.js';
import { listHandbookHistory, readHandbookHistory } from '../workplaceHandbookHistory.service.js';
beforeEach(() => vi.resetAllMocks());
it('allows published and previously communicated updates, with tenant scope on every query', async () => {
  pool.execute.mockResolvedValue([[{ id: 1, status: 'draft', communicated: 1 }, { id: 2, status: 'published', communicated: 0 }]]);
  const months = await listHandbookHistory(2);
  expect(months.map(m => m.availability)).toEqual(['Communicated update', 'Published']);
  const [sql, params] = pool.execute.mock.lastCall;
  expect(params).toEqual([2]); expect(sql).toContain('d.agency_id = ?');
  expect(sql).toContain("AND (d.status = 'published' OR EXISTS");
  expect(sql).toContain('p.agency_id = d.agency_id'); expect(sql).toContain('p.sent_at IS NOT NULL');
});
it('denies unpublished or cross-tenant IDs before loading any contents', async () => {
  pool.execute.mockResolvedValue([[]]);
  await expect(readHandbookHistory(2, 55)).rejects.toMatchObject({ status: 404 });
  expect(pool.execute.mock.lastCall[1]).toEqual([2, 55]); expect(getDigest).not.toHaveBeenCalled();
  await expect(readHandbookHistory(2, -1)).rejects.toMatchObject({ status: 404 });
});
it('returns reader metadata without administrative notes and allows drafts only with explicit administrator access', async () => {
  pool.execute.mockResolvedValue([[{ id: 3, status: 'draft', communicated: 0 }]]);
  getDigest.mockResolvedValue({ digest: { id: 3, notes: 'Internal note' }, entries: [{ id: 4, changed_content: 'November proposal' }] });
  const result = await readHandbookHistory(2, 3, { includeDrafts: true });
  expect(result.digest.availability).toBe('Draft · Not published'); expect(result.digest).not.toHaveProperty('notes');
  expect(getDigest).toHaveBeenCalledWith(3, 2);
});
