import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ list: vi.fn(), agencies: vi.fn() }));
vi.mock('../../models/ReferralPacketDraft.model.js', () => ({ default: { listOpen: m.list } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies } }));
import { listUnsubmittedPackets } from '../referralDraftRecovery.controller.js';

beforeEach(() => {
  vi.clearAllMocks(); m.agencies.mockResolvedValue([{ id: 2 }]);
  m.list.mockResolvedValue({ total: 1, drafts: [{ id: 10, first_name: 'Synthetic', last_name: 'Student', upload_note: 'Private note', initials: 'SynStu' }] });
});
it('scopes paginated packet metadata to the actual agency membership', async () => {
  const res = { json: vi.fn() }, next = vi.fn();
  await listUnsubmittedPackets({ user: { id: 7, role: 'admin' }, query: { limit: '500', offset: '-9' } }, res, next);
  expect(m.list).toHaveBeenCalledWith({ agencyIds: [2], limit: 100, offset: 0 });
  expect(res.json).toHaveBeenCalledWith({ drafts: [{ id: 10, initials: 'SynStu' }], total: 1, limit: 100, offset: 0 });
  expect(next).not.toHaveBeenCalled();
});
it('does not turn a forged agency filter into access to another agency', async () => {
  await listUnsubmittedPackets({ user: { id: 7, role: 'admin' }, query: { agencyId: '3' } }, { json: vi.fn() }, vi.fn());
  expect(m.list).toHaveBeenCalledWith({ agencyIds: [], limit: 50, offset: 0 });
});
it('rejects malformed filters before querying packets', async () => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await listUnsubmittedPackets({ user: { id: 7, role: 'admin' }, query: { agencyId: '2junk' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400); expect(m.list).not.toHaveBeenCalled();
});
