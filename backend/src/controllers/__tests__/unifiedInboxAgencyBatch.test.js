import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../services/unifiedInbox.service.js', () => ({ listConversations: vi.fn() }));

import User from '../../models/User.model.js';
import { listConversations } from '../../services/unifiedInbox.service.js';
import { getUnifiedConversations } from '../unifiedInbox.controller.js';

beforeEach(() => vi.resetAllMocks());

function request(scopes, query = {}) {
  const req = {
    user: { id: 5, role: 'provider' },
    query: {
      agencyId: '2', channel: 'group', claimState: 'claimed', filter: 'unknown', hubScope: '1',
      agencyScopes: JSON.stringify(scopes), ...query
    }
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return { req, res, next: vi.fn() };
}

it('scopes each batch page to the viewer, limits concurrent reads, and preserves pagination', async () => {
  const scopes = [2, 3, 4, 5, 6, 7].map(agencyId => ({ agencyId, groupInboxId: agencyId * 10, offset: agencyId * 2 }));
  User.getAgencies.mockResolvedValue(scopes.map(({ agencyId }) => ({ id: agencyId })));
  let active = 0;
  let peak = 0;
  listConversations.mockImplementation(async opts => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return [{ id: opts.inboxId }];
  });

  const { req, res, next } = request(scopes);
  await getUnifiedConversations(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(User.getAgencies).toHaveBeenCalledExactlyOnceWith(5);
  expect(peak).toBe(4);
  expect(listConversations.mock.calls.map(([opts]) => opts)).toEqual(scopes.map((scope, index) => expect.objectContaining({
    agencyId: scope.agencyId, inboxId: scope.groupInboxId, offset: scope.offset, scopeToUserId: 5,
    includeGlobal: index === 0, filter: 'unknown', claimState: 'claimed', groupOnly: true, syncTickets: false
  })));
  expect(res.json).toHaveBeenCalledWith({ conversations: scopes.map(scope => ({ id: scope.groupInboxId, agency_id: scope.agencyId })) });
});

it('rejects a batch with an inaccessible agency before reading any conversation', async () => {
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  const { req, res, next } = request([{ agencyId: 2, offset: 0 }, { agencyId: 3, offset: 0 }]);
  await getUnifiedConversations(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(listConversations).not.toHaveBeenCalled();
});

it('rejects duplicate scope IDs and invalid offsets', async () => {
  for (const scopes of [
    [{ agencyId: 2, offset: 0 }, { agencyId: 2, offset: 1 }],
    [{ agencyId: 2, offset: -1 }]
  ]) {
    const { req, res, next } = request(scopes);
    await getUnifiedConversations(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(listConversations).not.toHaveBeenCalled();
});
