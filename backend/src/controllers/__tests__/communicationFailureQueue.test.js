import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { removeFailedCommunications } from '../communicationFailureQueue.controller.js';
import { buildCommunicationListFilters } from '../../services/outboundEmailQuality.service.js';

const req = () => ({ user: { id: 8, role: 'support' }, body: { agencyId: 2, ids: [4219, 4220] } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  pool.execute.mockResolvedValue([{ affectedRows: 2 }]);
});

it.each(['provider', 'school_staff', 'client_guardian'])('rejects removal by %s', async role => {
  const request = req(); request.user.role = role;
  const res = response(); await removeFailedCommunications(request, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute).not.toHaveBeenCalled();
});
it('rejects another agency before updating any records', async () => {
  const request = req(); request.body.agencyId = 3;
  const res = response(); await removeFailedCommunications(request, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute).not.toHaveBeenCalled();
});
it.each([[], [0], ['4220'], [1.5], Array(501).fill(1)])('rejects invalid or oversized selections', async ids => {
  const request = req(); request.body.ids = ids;
  const res = response(); await removeFailedCommunications(request, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.execute).not.toHaveBeenCalled();
});
it('removes only selected failed emails in the authorized agency and preserves the delivery evidence', async () => {
  const request = req(); request.body.ids = [4219, 4220, 4220];
  const res = response(); await removeFailedCommunications(request, res, vi.fn());
  const [sql, values] = pool.execute.mock.calls[0];
  expect(sql).toContain("WHERE agency_id = ? AND channel = 'email'");
  expect(sql).toContain('AND id IN (?,?)');
  expect(sql).toContain('AND delivery_status IN (?,?,?,?)');
  expect(sql).toContain("JSON_EXTRACT(metadata, '$.failedListRemovedAt') IS NULL");
  expect(sql).not.toMatch(/DELETE FROM|SET delivery_status|error_message\s*=/);
  expect(values.slice(1)).toEqual([8, 2, 4219, 4220, 'failed', 'bounced', 'undelivered', 'skipped']);
  expect(res.json).toHaveBeenCalledWith({ removed: 2 });
});
it('reports zero when records were already removed, retried successfully, or outside the selected agency', async () => {
  pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
  const res = response(); await removeFailedCommunications(req(), res, vi.fn());
  expect(res.json).toHaveBeenCalledWith({ removed: 0 });
});
it('passes database errors to the error handler without reporting success', async () => {
  const error = new Error('Database unavailable'); pool.execute.mockRejectedValue(error);
  const res = response(), next = vi.fn(); await removeFailedCommunications(req(), res, next);
  expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
});
it.each(['failed', 'all', 'sent'])('filters removed failures in the %s automation query without hiding later sent delivery', status => {
  const { where, params } = buildCommunicationListFilters({ agencyId: 2, channel: 'email', status });
  expect(params[0]).toBe(2);
  expect(where.join(' AND ')).toContain("uc.delivery_status NOT IN ('failed', 'bounced', 'undelivered', 'skipped')");
  expect(where.join(' AND ')).toContain("OR JSON_EXTRACT(uc.metadata, '$.failedListRemovedAt') IS NULL");
});
