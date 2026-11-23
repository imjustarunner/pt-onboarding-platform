import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ execute: vi.fn(), membership: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: h.execute } }));
vi.mock('../clientSchoolYear.service.js', () => ({ ensureClientSchoolYearMembership: h.membership }));
import { stampClientTerminationSchoolYear } from '../clientTerminationSchoolYear.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
  h.execute.mockImplementation(async sql => sql.startsWith('SELECT') ? [[{ id: 51, agency_id: 2, school_year: '2026-2027', grade: '6' }]] : [{ affectedRows: 1 }]);
  h.membership.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('uses the supplied historical date for the termination school year', async () => {
  expect(await stampClientTerminationSchoolYear({ clientId: 51, actorUserId: 8, effectiveDate: '2025-03-02' })).toBe('2024-2025');
  expect(h.execute).toHaveBeenCalledWith('UPDATE clients SET termination_school_year = ? WHERE id = ?', ['2024-2025', 51]);
  expect(h.membership).toHaveBeenCalledWith(expect.objectContaining({ schoolYear: '2024-2025', actorUserId: 8 }));
});

it('retains the existing roster-year behavior when no date is supplied', async () => {
  expect(await stampClientTerminationSchoolYear({ clientId: 51 })).toBe('2026-2027');
});
