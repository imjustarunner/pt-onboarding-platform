import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { requireConversationAccess } from '../communicationAccess.service.js';
beforeEach(() => { vi.resetAllMocks(); User.getAgencies.mockResolvedValue([{ id: 2 }]); });
describe('conversation and attachment access', () => {
  it('denies another tenant even for an agency admin', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, agency_id: 3 }]]);
    await expect(requireConversationAccess({ id: 5, role: 'admin' }, 1)).rejects.toMatchObject({ status: 404 });
  });
  it('keeps a personal inbox private from another agency admin', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, agency_id: 2, inbox_kind: 'personal', inbox_owner_user_id: 6 }]]);
    await expect(requireConversationAccess({ id: 5, role: 'admin' }, 1)).rejects.toMatchObject({ status: 404 });
  });
  it('allows the personal inbox owner', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, agency_id: 2, inbox_kind: 'personal', inbox_owner_user_id: 5 }]]);
    expect(await requireConversationAccess({ id: 5, role: 'provider' }, 1)).toMatchObject({ id: 1 });
  });
  it('denies an unrelated shared conversation', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, agency_id: 2, inbox_kind: 'shared' }]]).mockResolvedValueOnce([[]]);
    await expect(requireConversationAccess({ id: 5, role: 'provider' }, 1)).rejects.toMatchObject({ status: 404 });
  });
});

it('allows a second active assigned provider to open the shared SMS conversation', async () => {
 pool.execute.mockResolvedValueOnce([[{id:1,agency_id:2,channel:'sms',owner_user_id:10,external_thread_id:'sms:v2:client:4:test'}]])
   .mockResolvedValueOnce([[{id:1}]]);
 expect(await requireConversationAccess({id:11,role:'provider'},1)).toMatchObject({id:1});
 expect(pool.execute.mock.calls[1][1]).toEqual([1,11,11,11]);
});
it('does not grant shared SMS access from assignment in another agency', async () => {
 pool.execute.mockResolvedValueOnce([[{id:1,agency_id:3,channel:'sms',owner_user_id:10}]]);
 await expect(requireConversationAccess({id:11,role:'provider'},1)).rejects.toMatchObject({status:404});
 expect(pool.execute).toHaveBeenCalledTimes(1);
});
