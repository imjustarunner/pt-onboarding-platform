import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { closeStaffPoll, saveStaffPollVote, scheduleStaffPollClosing } from '../staffPollLifecycle.service.js';
let row, conn, db;
beforeEach(() => {
  row = { id: 20, agency_id: 4, is_active: 1, event_type: 'team_poll', ends_at: '2099-12-31T12:00:00Z', voting_config_json: { enabled: true }, voting_closed_at: null };
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => sql.startsWith('SELECT') ? [[row]] : [{ affectedRows: 1 }]) };
  db = { getConnection: vi.fn(async () => conn) };
});
const vote = () => saveStaffPollVote({ eventId: 20, agencyId: 4, userId: 2, response: { key: '2', label: 'Friday', raw: '2' }, source: 'in_app' }, db);
it('updates one existing response under the event lock before the deadline', async () => {
  await vote();
  expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'), [20, 4]]);
  expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [20, 2, '2', 'Friday', '2', 'in_app', null]);
  expect(conn.commit).toHaveBeenCalledOnce(); expect(conn.release).toHaveBeenCalledOnce();
});
it.each(['manual', 'scheduled', 'legacy_deadline'])('rejects a late edit after %s closing and preserves the previous response', async kind => {
  if (kind === 'manual') row.voting_closed_at = '2026-01-01T12:00:00Z';
  if (kind === 'scheduled') row.voting_config_json.closesAt = '2026-01-01T12:00:00Z';
  if (kind === 'legacy_deadline') row.ends_at = '2026-01-01T12:00:00Z';
  await expect(vote()).rejects.toMatchObject({ status: 409, code: 'poll_closed' });
  expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  expect(conn.rollback).toHaveBeenCalledOnce();
});
it('records a scheduled close exactly once and ignores a schedule moved into the future', async () => {
  row.voting_config_json.closesAt = '2026-01-01T12:00:00Z';
  const first = await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db);
  expect(first.closed).toBe(true); expect(first.row.voting_closed_at.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  row.voting_closed_at = first.row.voting_closed_at;
  expect((await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db)).closed).toBe(false);
  row.voting_closed_at = null; row.voting_config_json.closesAt = '2099-01-01T12:00:00Z';
  expect((await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db)).closed).toBe(false);
  expect(conn.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'))).toHaveLength(1);
});
it('does not automatically finalize a legacy poll without an explicitly saved schedule', async () => {
  row.ends_at = '2026-01-01T12:00:00Z';
  expect((await closeStaffPoll({ eventId: 20, agencyId: 4, scheduledOnly: true }, db)).closed).toBe(false);
});
it('allows immediate closure before a scheduled deadline', async () => {
  row.voting_config_json.closesAt = '2099-01-01T12:00:00Z';
  expect((await closeStaffPoll({ eventId: 20, agencyId: 4 }, db)).closed).toBe(true);
});
it.each(['not-a-date', '2020-01-01T12:00:00Z'])('rejects an invalid or past schedule: %s', async closesAt => {
  await expect(scheduleStaffPollClosing({ eventId: 20, agencyId: 4, closesAt, actorUserId: 2 }, db)).rejects.toMatchObject({ status: 400 });
  expect(db.getConnection).not.toHaveBeenCalled();
});
it('does not reopen a poll when an owner tries to reschedule after closing', async () => {
  row.voting_closed_at = new Date();
  await expect(scheduleStaffPollClosing({ eventId: 20, agencyId: 4, closesAt: '2099-01-01T12:00:00Z', actorUserId: 2 }, db)).rejects.toMatchObject({ code: 'poll_closed' });
  expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
