import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn().mockResolvedValue([[]]) } }));
import pool from '../../config/database.js';
import { moveOfficeSessionSeries } from '../officeSessionMove.service.js';
let conn, request, source, conflict;
const original = { id: 1, room_id: 2, office_location_id: 3, weekday: 4, hour: 15, provider_id: 8, is_active: 1 };
const input = { assignment: original, newRoomId: 2, newWeekday: 4, newHour: 16, timeZone: 'America/Denver', actorUserId: 9, approvalRequestId: 7 };
beforeEach(() => {
 source = { ...original }; conflict = false;
 request = { id: 7, status: 'PENDING', request_type: 'MOVE_ASSIGNMENT', requester_notes: JSON.stringify({ sources: [original] }) };
 conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
  if(sql.startsWith('SELECT * FROM office_booking_requests')) return [[request]];
  if(sql.startsWith('SELECT * FROM office_standing_assignments') || sql.startsWith('SELECT id, room_id')) return [[source]];
  if(sql.startsWith('SELECT s.id, s.provider_id')) return [conflict ? [{id:99, provider_id:90, hour:16, first_name:'Another', last_name:'Provider'}] : []];
  return [[]];
 }) };
 pool.getConnection.mockResolvedValue(conn);
});
it('approves and moves in one transaction', async () => {
 await moveOfficeSessionSeries(input);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("SET status = 'APPROVED'"), [9, 7]);
 expect(conn.commit).toHaveBeenCalledOnce();
});
it('keeps the original reservation and the request pending when a conflict appears', async () => {
 conflict = true;
 await expect(moveOfficeSessionSeries(input)).rejects.toMatchObject({ code:'OFFICE_MOVE_CONFLICT' });
 expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
 expect(conn.rollback).toHaveBeenCalledOnce();
});
it('rejects stale requests and duplicate decisions', async () => {
 source.hour = 12;
 await expect(moveOfficeSessionSeries(input)).rejects.toThrow('original reservation changed');
 source = { ...original }; request.status = 'APPROVED';
 await expect(moveOfficeSessionSeries(input)).rejects.toThrow('no longer pending');
 expect(conn.commit).not.toHaveBeenCalled();
});
