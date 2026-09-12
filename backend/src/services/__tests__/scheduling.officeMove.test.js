import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { movedOfficeWindow, moveOfficeSessionSeries } from '../officeSessionMove.service.js';
const input = { assignment: { id: 1, weekday: 1, provider_id: 9 }, newRoomId: 2, newWeekday: 3, newHour: 10, timeZone: 'America/Denver', actorUserId: 9 };
let conn;
let conflict;
describe('move future office sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conflict = false;
    conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM office_events')) return [[{ id: 8, start_at: '2099-01-05 16:00:00', end_at: '2099-01-05 17:00:00' }]];
      if (sql.startsWith('SELECT id FROM office_events WHERE room_id')) return [conflict ? [{ id: 99 }] : []];
      if (sql.includes('SELECT id, skipped_dates_json')) return [[{ id: 2, skipped_dates_json: '["2099-01-12"]' }]];
      return [[]];
    }) };
    pool.getConnection.mockResolvedValue(conn);
    clinicalPool.execute.mockResolvedValue([[]]);
  });
  it('keeps the same event and appointment identities when moving a series', async () => {
    expect(await moveOfficeSessionSeries(input)).toEqual([8]);
    const queries = conn.execute.mock.calls.map(([sql]) => sql);
    expect(queries.some((sql) => /INSERT INTO|DELETE FROM/.test(sql))).toBe(false);
    expect(queries.some((sql) => sql.startsWith('UPDATE appointments'))).toBe(true);
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE clinical_sessions'), expect.arrayContaining([8]));
  });
  it('rolls back the whole series when the target room is occupied', async () => {
    conflict = true;
    await expect(moveOfficeSessionSeries(input)).rejects.toThrow('conflicting event');
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('does not move signed clinical history', async () => {
    clinicalPool.execute.mockResolvedValue([[{ id: 4 }]]);
    await expect(moveOfficeSessionSeries(input)).rejects.toThrow('signed note');
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it('uses local calendar days when a move crosses a daylight-saving transition', () => {
    const moved = movedOfficeWindow({ start_at: '2026-10-31 15:00:00', end_at: '2026-10-31 16:00:00' },
      { oldWeekday: 5, newWeekday: 6, newHour: 9, timeZone: 'America/Denver' });
    expect(moved).toEqual({ startAt: '2026-11-01 16:00:00', endAt: '2026-11-01 17:00:00', date: '2026-11-01' });
  });
});
