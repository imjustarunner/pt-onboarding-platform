import { describe, expect, it } from 'vitest';
import { assignmentStartsInCell, closureForSchoolDate, closureLabel, schoolRailSummary, schoolRailTone } from '../schoolAssignmentRail.js';

describe('school assignment rail', () => {
  const assignment = { schoolOrgId: 20, slotsTotal: 4, slotsUsed: 2, startTime: '08:00' };

  it('colors open, nearly full, and full assignments, and a closure replaces the hue', () => {
    expect(schoolRailTone(assignment, null)).toBe('open');
    expect(schoolRailTone({ slotsTotal: 4, slotsUsed: 3 }, null)).toBe('tight');
    expect(schoolRailTone({ slotsTotal: 4, slotsUsed: 4 }, null)).toBe('full');
    expect(schoolRailTone(assignment, { kind: 'no_school' })).toBe('closed');
    expect(schoolRailSummary(assignment)).toBe('2 / 4 assigned · 2 open');
  });

  it('starts the rail in the cell that contains the assignment and names the closure', () => {
    expect(assignmentStartsInCell('08:15', 8, 0, 60)).toBe(true);
    expect(assignmentStartsInCell('08:15', 8, 0, 15)).toBe(false);
    expect(assignmentStartsInCell('08:15', 8, 15, 15)).toBe(true);
    const closure = closureForSchoolDate([
      { schoolOrgId: 20, date: '2026-10-13', scope: 'district', kind: 'no_school', reason: 'Break', recordedByName: 'Casey' },
      { schoolOrgId: 20, date: '2026-10-13', scope: 'school', kind: 'sessions_prohibited', reason: 'Testing', recordedByName: 'Jamie' }
    ], 20, '2026-10-13');
    expect(closure.reason).toBe('Testing');
    expect(closureLabel(closure)).toContain('Sessions prohibited');
    expect(closureLabel(closure)).toContain('Jamie');
  });
});
