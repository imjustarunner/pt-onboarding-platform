vi.mock('../officeMoveEmail.service.js', () => ({ queueOfficeMoveReceipt: vi.fn() }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { movedOfficeWindow, moveOfficeSessionSeries } from '../officeSessionMove.service.js';
const input = { assignment: { id: 1, room_id: 1, hour: 9, office_location_id: 1, weekday: 1, provider_id: 9 }, newRoomId: 2, newWeekday: 3, newHour: 10, timeZone: 'America/Denver', actorUserId: 9 };
let conn;
let conflict;
describe('move future office sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conflict = false;
    conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT id, room_id, weekday, hour')) return [[{...input.assignment}]];
      if (sql.startsWith('SELECT * FROM office_events')) return [[{ id: 8, standing_assignment_id: 1, start_at: '2099-01-05 16:00:00', end_at: '2099-01-05 17:00:00' }]];
      if (sql.startsWith('SELECT e.id, e.start_at')) return [conflict ? [{ id: 99, start_at: '2099-01-07 17:00:00', end_at: '2099-01-07 18:00:00', first_name: 'Test', last_name: 'Provider' }] : []];
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
  it('merges the provider’s empty destination room series without recreating clinical appointments', async () => {
    const base = conn.execute.getMockImplementation();
    conn.execute.mockImplementation(async (sql, args) => {
      if (sql.startsWith('SELECT s.id, s.provider_id')) return [[{ id: 22, provider_id: 9, hour: 10 }]];
      if (sql.startsWith('SELECT e.id, e.start_at')) return [[{ id: 99, status: 'BOOKED', assigned_provider_id: 9, booked_provider_id: 9, start_at: '2099-01-07 17:00:00', end_at: '2099-01-07 18:00:00' }]];
      return base(sql, args);
    });
    expect(await moveOfficeSessionSeries({ ...input, reuseOwnReservations: true })).toEqual([8]);
    expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE office_standing_assignments SET is_active=FALSE'), [22]);
    expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE office_events SET status='CANCELLED'"), [99]);
    expect(conn.execute.mock.calls.some(([sql]) => /INSERT INTO appointments|DELETE FROM/.test(sql))).toBe(false);
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('keeps both series intact when the destination has another client’s booking plan', async () => {
    const base = conn.execute.getMockImplementation();
    conn.execute.mockImplementation(async (sql, args) => {
      if (sql.startsWith('SELECT s.id, s.provider_id')) return [[{ id: 22, provider_id: 9, hour: 10 }]];
      if (sql.startsWith('SELECT id FROM office_booking_plans WHERE standing_assignment_id=')) return [[{ id: 33 }]];
      return base(sql, args);
    });
    await expect(moveOfficeSessionSeries({ ...input, reuseOwnReservations: true })).rejects.toThrow('already has client sessions');
    expect(conn.commit).not.toHaveBeenCalled(); expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('uses local calendar days when a move crosses a daylight-saving transition', () => {
    const moved = movedOfficeWindow({ start_at: '2026-10-31 15:00:00', end_at: '2026-10-31 16:00:00' },
      { oldWeekday: 5, newWeekday: 6, newHour: 9, timeZone: 'America/Denver' });
    expect(moved).toEqual({ startAt: '2026-11-01 16:00:00', endAt: '2026-11-01 17:00:00', date: '2026-11-01' });
  });
});
