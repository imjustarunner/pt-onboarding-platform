import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), materialize: vi.fn(), agency: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: m.agency } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: {} }));
vi.mock('../providerAvailability.service.js', () => ({ default: {} }));
vi.mock('../companyEventSessionDates.service.js', () => ({ materializeSessionsForEvent: m.materialize }));
import { createDistrictSchoolEvents, updateDistrictSchoolEvents, listSchoolEventsForOrg } from '../schoolPortalEvents.service.js';
import { updateDistrictCalendarDate, deleteDistrictCalendarDate, listDistrictCalendarDatesForSchool } from '../districtCalendarDates.service.js';
const row = { id: 10, agency_id: 1, organization_id: null, district_name: 'D11', district_broadcast_id: 'shared-date',
  event_type: 'school_day_off', title: 'Fall Break', starts_at: '2026-10-19T06:00:00Z', ends_at: '2026-10-24T05:59:59Z',
  timezone: 'America/Denver', is_active: 1, staffing_config_json: '{"enabled":false}' };
beforeEach(() => { vi.clearAllMocks(); m.agency.mockResolvedValue(1); });
describe('shared district important dates', () => {
  it('inserts exactly one date for a district with multiple schools, without staffing sessions', async () => {
    m.execute.mockImplementation(async sql => {
      if (sql.includes('SELECT sp.school_organization_id AS id')) return [[{ id: 2 }, { id: 3 }, { id: 4 }]];
      if (sql.includes('INSERT INTO company_events')) return [{ insertId: 10 }];
      if (sql.includes('SELECT * FROM company_events')) return [[row]];
      return [[]];
    });
    const result = await createDistrictSchoolEvents({ agencyId: 1, userId: 5, districtName: 'D11', category: 'day_off',
      title: 'Fall Break', startsAt: row.starts_at, endsAt: row.ends_at, timezone: row.timezone });
    expect(result.createdCount).toBe(1);
    expect(result.schoolCount).toBe(3);
    expect(result.events[0]).toMatchObject({ id: 10, isDistrictImportantDate: true, organizationId: null, staffingEnabled: false });
    expect(m.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO company_events'))).toHaveLength(1);
    expect(m.materialize).not.toHaveBeenCalled();
  });
  it('updates a shared broadcast once without creating school copies', async () => {
    m.execute.mockImplementation(async sql => sql.includes('UPDATE company_events') ? [{ affectedRows: 1 }] : [[row]]);
    const result = await updateDistrictSchoolEvents({ agencyId: 1, districtBroadcastId: 'shared-date', userId: 5, title: 'Updated Fall Break' });
    expect(result.updatedCount).toBe(1);
    expect(m.execute.mock.calls.filter(([sql]) => sql.includes('UPDATE company_events'))).toHaveLength(1);
    expect(m.materialize).not.toHaveBeenCalled();
  });
  it('scopes school visibility by both agency and district, without inserting copies', async () => {
    m.execute.mockResolvedValue([[row]]);
    const first = await listDistrictCalendarDatesForSchool({ agencyId: 1, organizationId: 2 });
    const second = await listDistrictCalendarDatesForSchool({ agencyId: 1, organizationId: 3 });
    expect(first[0].id).toBe(second[0].id);
    const [sql, params] = m.execute.mock.calls[0];
    expect(sql).toContain('ce.agency_id = ?');
    expect(sql).toContain('sp.school_organization_id = ?');
    expect(sql).toContain('LOWER(TRIM(sp.district_name)) = LOWER(TRIM(ce.district_name))');
    expect(params[0]).toBe(1);
    expect(params.at(-1)).toBe(2);
    expect(await listDistrictCalendarDatesForSchool({ agencyId: null, organizationId: 2 })).toEqual([]);
  });
  it('denies changes to a row outside the selected agency', async () => {
    m.execute.mockResolvedValue([[]]);
    await expect(updateDistrictCalendarDate({ eventId: 10, agencyId: 99, userId: 5, title: 'Other' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteDistrictCalendarDate({ eventId: 10, agencyId: 99, userId: 5 })).rejects.toMatchObject({ status: 404 });
    expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it('cannot turn a district important date into a staffed event', async () => {
    m.execute.mockResolvedValue([[row]]);
    await expect(updateDistrictCalendarDate({ eventId: 10, agencyId: 1, userId: 5, eventType: 'school_open_house' })).rejects.toMatchObject({ status: 400 });
  });
  it('deletes the single shared record for the entire district', async () => {
    m.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await deleteDistrictCalendarDate({ eventId: 10, agencyId: 1, userId: 5 })).toMatchObject({ deleted: true, deletedCount: 1 });
    expect(m.execute.mock.calls[1][1]).toEqual([5, 10, 1]);
  });
  it('returns the same shared ID from each school portal without assigning it a school', async () => {
    m.execute.mockImplementation(async sql => sql.includes('SELECT ce.* FROM company_events ce') ? [[row]] : [[]]);
    const a = await listSchoolEventsForOrg(2);
    const b = await listSchoolEventsForOrg(3);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toMatchObject({ id: 10, organizationId: null, isDistrictImportantDate: true });
    expect(b[0].id).toBe(a[0].id);
    expect(m.execute.mock.calls.every(([sql]) => !sql.includes('INSERT'))).toBe(true);
  });

});
