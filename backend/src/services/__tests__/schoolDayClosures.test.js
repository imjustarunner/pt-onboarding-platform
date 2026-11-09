import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../schoolPortalEvents.service.js', () => ({ createSchoolPortalEvent: vi.fn() }));
import { closureRecords, createSchoolDayClosures } from '../schoolDayClosures.service.js';

const school = { schoolOrgId: 20, agencyId: 2, districtName: 'D11' };
const holiday = {
  id: 8, agency_id: 2, organization_id: null, district_name: 'D11', event_type: 'school_holiday',
  title: 'Fall Break', description: 'District break', timezone: 'America/Denver',
  starts_at: new Date('2026-10-13T06:00:00Z'), ends_at: new Date('2026-10-14T05:59:59Z'),
  created_at: '2026-10-01 12:00:00', recorded_by_name: 'Casey Admin'
};
const testing = {
  id: 9, agency_id: 2, organization_id: 20, district_name: null, event_type: 'school_sessions_prohibited',
  title: 'Testing', description: 'State testing', timezone: 'America/Denver',
  starts_at: new Date('2026-10-13T06:00:00Z'), ends_at: new Date('2026-10-14T05:59:59Z'),
  created_at: '2026-10-02 12:00:00', recorded_by_name: 'Jamie School'
};

describe('school day closures', () => {
  it('marks full days in the school timezone, including inclusive ends and DST', () => {
    const [full] = closureRecords([holiday], [{ ...school, schoolName: 'North' }], '2026-10-12', '2026-10-19');
    expect(full).toMatchObject({ fullDay: true, schoolName: 'North' });
    const [partial] = closureRecords([{ ...holiday, starts_at: new Date('2026-10-13T15:00:00Z') }], [school], '2026-10-12', '2026-10-19');
    expect(partial.fullDay).toBe(false);
    const dst = { ...holiday, starts_at: new Date('2026-11-01T06:00:00Z'), ends_at: new Date('2026-11-02T07:00:00Z') };
    expect(closureRecords([dst], [school], '2026-11-01', '2026-11-03')).toMatchObject([{ date: '2026-11-01', fullDay: true }]);
  });

  it('does not match a same-name district in another agency', () => {
    const outside = { schoolOrgId: 99, agencyId: 3, districtName: 'D11' };
    expect(closureRecords([holiday], [school, outside], '2026-10-12', '2026-10-19').map(row => row.schoolOrgId)).toEqual([20]);
  });

  it('retains a district full-day closure when a school also has a partial-day restriction', () => {
    const partial = { ...testing, starts_at: new Date('2026-10-13T15:00:00Z'), ends_at: new Date('2026-10-13T17:00:00Z') };
    const closures = closureRecords([holiday, partial], [school], '2026-10-12', '2026-10-19');
    expect(closures).toHaveLength(2);
    expect(closures.find(row => row.fullDay)).toMatchObject({ scope: 'district', title: 'Fall Break' });
  });
  it('prefers a school sessions-prohibited date over a district holiday on the same day', () => {
    const [closure] = closureRecords([holiday, testing], [school], '2026-10-12', '2026-10-19');
    expect(closure).toMatchObject({
      schoolOrgId: 20, date: '2026-10-13', kind: 'sessions_prohibited', scope: 'school',
      reason: 'State testing', recordedByName: 'Jamie School'
    });
  });

  it('applies a district no-school date to every assigned school in that district', () => {
    const other = { schoolOrgId: 21, agencyId: 2, districtName: 'D11' };
    const outside = { schoolOrgId: 22, agencyId: 2, districtName: 'Other' };
    const closures = closureRecords([holiday], [school, other, outside], '2026-10-12', '2026-10-19');
    expect(closures.map(item => item.schoolOrgId).sort()).toEqual([20, 21]);
    expect(closures[0]).toMatchObject({ kind: 'no_school', scope: 'district', reason: 'District break' });
  });
});

describe('mark school no-school day', () => {
  const db = { execute: vi.fn() };
  const createEvent = vi.fn(async () => ({ id: 44 }));
  const service = createSchoolDayClosures({ db, createEvent });
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not create a second row when the day is already closed', async () => {
    db.execute.mockImplementation(async sql => {
      if (sql.includes('SELECT psa.id')) return [[{ id: 1 }]];
      if (sql.includes('school_organization_id AS schoolOrgId')) return [[school]];
      if (sql.includes('FROM company_events')) return [[{ ...holiday, organization_id: 20, district_name: null, event_type: 'school_day_off' }]];
      return [[]];
    });
    const result = await service.markSchoolNoSchoolDay({
      providerId: 7, agencyId: 2, schoolOrgId: 20, userId: 7, date: '2026-10-13', reason: 'Building closed'
    });
    expect(result.alreadyClosed).toBe(true);
    expect(result.closure.reason).toBe('District break');
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('writes one no-school date for that school only', async () => {
    db.execute.mockImplementation(async sql => {
      if (sql.includes('SELECT psa.id')) return [[{ id: 1 }]];
      if (sql.includes('school_organization_id AS schoolOrgId')) return [[school]];
      if (sql.includes('FROM company_events')) return [[]];
      if (sql.includes('FROM users')) return [[{ name: 'Avery Provider' }]];
      return [[]];
    });
    const result = await service.markSchoolNoSchoolDay({
      providerId: 7, agencyId: 2, schoolOrgId: 20, userId: 7, date: '2026-10-13', reason: 'Building closed', timeZone: 'America/Denver'
    });
    expect(result.alreadyClosed).toBe(false);
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 20, category: 'day_off', title: 'No school', description: 'Building closed'
    }));
    expect(result.closure).toMatchObject({ scope: 'school', kind: 'no_school', recordedByName: 'Avery Provider' });
  });
});
