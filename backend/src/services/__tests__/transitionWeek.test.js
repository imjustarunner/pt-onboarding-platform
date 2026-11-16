import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), configured: true }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../chatEncryption.service.js', () => ({ encryptChatText: text => ({ sealed: text }), decryptChatText: value => value.sealed, isChatEncryptionConfigured: () => m.configured }));
vi.mock('../clientSessionBookingRollout.service.js', () => ({ sessionBookingProviders: async () => [{ id: 3, name: 'Synthetic provider' }] }));
import { readTransitionWeek, saveTransitionWeek } from '../transitionWeek.service.js';
import { emptyTransitionState } from '../../content/transitionWeek.js';
let row;
beforeEach(() => {
  vi.clearAllMocks(); m.configured = true;
  row = { revision: 0, payload_json: { sealed: JSON.stringify({ agencyId: 6, week: '2026-11-16', state: emptyTransitionState() }) } };
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT') ? [[row]] : [{ affectedRows: 1 }]);
});
it('reads only the selected practice and rejects swapped encrypted evidence', async () => {
  expect((await readTransitionWeek(6)).revision).toBe(0);
  expect(m.execute.mock.calls[0][1]).toEqual([6, '2026-11-16']);
  await expect(readTransitionWeek(377)).rejects.toThrow('context');
});
it('atomically retains a revisioned append-only snapshot attributed to the current actor', async () => {
  const state = emptyTransitionState(); state.tasks.owners.owner = 'Assigned lead';
  expect((await saveTransitionWeek({ agencyId: 6, actorUserId: 92, input: { action: 'save', revision: 0, state } })).revision).toBe(1);
  const event = m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO practice_transition_week_events'));
  expect(event[1].slice(0,4)).toEqual([6, '2026-11-16', 1, 92]);
  expect(m.commit).toHaveBeenCalledOnce(); expect(m.release).toHaveBeenCalledOnce();
});
it('rejects stale writes without appending a revision', async () => {
  row.revision = 2;
  await expect(saveTransitionWeek({ agencyId: 6, actorUserId: 92, input: { action: 'save', revision: 1, state: emptyTransitionState() } })).rejects.toMatchObject({ status: 409 });
  expect(m.commit).not.toHaveBeenCalled(); expect(m.rollback).toHaveBeenCalledOnce();
});
it('fails closed without encryption and rolls back failed history writes', async () => {
  m.configured = false;
  await expect(saveTransitionWeek({ agencyId: 6, actorUserId: 92, input: {} })).rejects.toMatchObject({ status: 503 });
  m.configured = true;
  m.execute.mockImplementation(async sql => { if (sql.startsWith('INSERT INTO practice_transition_week_events')) throw Error('History unavailable'); return sql.startsWith('SELECT') ? [[row]] : [{}]; });
  await expect(saveTransitionWeek({ agencyId: 6, actorUserId: 92, input: { action: 'save', revision: 0, state: emptyTransitionState() } })).rejects.toThrow('History unavailable');
  expect(m.commit).not.toHaveBeenCalled();
});
