import { describe, expect, it, vi } from 'vitest';
import { loadOfficeWorkspaceAssignments } from '../superviseeWorkspaceAssignments.service.js';

const scope = { providerUserId: 81, agencyId: 450 };
const now = new Date('2026-11-03T01:00:00Z'); // November 2 in Denver.
const assignment = (id, patch = {}) => ({ id, weekday: 1, hour: 9, assigned_frequency: 'WEEKLY', availability_mode: 'AVAILABLE', timezone: 'America/Denver', booking_agency_id: 450, name: 'Demo office', room: 'A', ...patch });

describe('current supervisee office assignments', () => {
  it('includes active recurring hours with days, local times and capacity without generating events', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[assignment(1)]]).mockResolvedValueOnce([[]]) };
    const result = await loadOfficeWorkspaceAssignments(scope, db, { now });
    expect(result).toMatchObject([{ kind: 'standing', day: 'Monday', startTime: '09:00', endTime: '10:00', timezone: 'America/Denver', slotsTotal: 1, slotsAvailable: 1, clients: 0 }]);
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toContain('s.booking_agency_id=?');
    expect(sql).toContain('office_location_agencies');
    expect(params).toEqual([81, 450, 450, 450]);
    expect(db.execute.mock.calls.every(([query]) => query.trim().startsWith('SELECT'))).toBe(true);
  });

  it('counts distinct linked clients but leaves incomplete or foreign plan context unavailable', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[assignment(1), assignment(2), assignment(3)]])
      .mockResolvedValueOnce([[
        { standing_assignment_id: 1, booked_frequency: 'WEEKLY', session_context_json: { agencyId: 450, clientId: 5 } },
        { standing_assignment_id: 1, booked_frequency: 'BIWEEKLY', session_context_json: JSON.stringify({ agencyId: 450, clientId: 5 }) },
        { standing_assignment_id: 2, booked_frequency: 'WEEKLY', session_context_json: { agencyId: 900, clientId: 8 } },
        { standing_assignment_id: 3, booked_frequency: 'WEEKLY', session_context_json: null }
      ]]) };
    const result = await loadOfficeWorkspaceAssignments(scope, db, { now });
    expect(result[0]).toMatchObject({ clients: 1, slotsAvailable: null, bookingPlanCount: 2, bookingFrequencies: ['WEEKLY', 'BIWEEKLY'] });
    expect(result[1]).toMatchObject({ clients: null, slotsAvailable: null });
    expect(result[2]).toMatchObject({ clients: null, slotsAvailable: null });
    expect(JSON.stringify(result)).not.toContain('clientId');
  });

  it('uses office-local dates for temporary assignments and excludes expired booking plans', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[
      assignment(1, { availability_mode: 'TEMPORARY', temporary_until_date: '2026-11-02' }),
      assignment(2, { availability_mode: 'TEMPORARY', temporary_until_date: '2026-11-01' })
    ]]).mockResolvedValueOnce([[{ standing_assignment_id: 1, active_until_date: '2026-11-01', session_context_json: null }]]) };
    const result = await loadOfficeWorkspaceAssignments(scope, db, { now });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, untilDate: '2026-11-02', bookingPlanCount: 0, slotsAvailable: null });
    expect(db.execute.mock.calls[1][1]).toEqual([1]);
  });

  it('does not turn a query failure into empty assignments or zero capacity', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('Database unavailable')) };
    await expect(loadOfficeWorkspaceAssignments(scope, db, { now })).rejects.toThrow('Database unavailable');
  });
});
