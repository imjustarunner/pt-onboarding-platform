import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), materialize: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: {} }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: {} }));
vi.mock('../providerAvailability.service.js', () => ({ default: {} }));
vi.mock('../companyEventSessionDates.service.js', () => ({ materializeSessionsForEvent: m.materialize }));
vi.mock('../companyEventOperations.service.js', () => ({ validateEventOperations: vi.fn(async () => ({})), saveEventOperations: vi.fn() }));
import { createDistrictOutreachEvent, updateDistrictOutreachEvent, createSchoolPortalEvent, updateSchoolPortalEvent, mapSchoolEventRow } from '../schoolPortalEvents.service.js';
import { prepareEventVenueUpdate, saveEventVenue } from '../companyEventVenue.service.js';

const address = '123 Main St, Denver, CO 80202';
const input = { agencyId: 2, userId: 7, eventId: 15, title: 'Testing', category: 'other',
  startsAt: '2026-10-26T23:00:00Z', endsAt: '2026-10-27T01:00:00Z', timezone: 'America/Denver',
  eventVenue: { eventLocationName: 'Community center', eventLocationAddress: address } };
let stored;
beforeEach(() => {
  vi.clearAllMocks();
  stored = { id: 15, agency_id: 2, organization_id: null, event_type: 'school_outreach', title: input.title,
    starts_at: input.startsAt, ends_at: input.endsAt, timezone: input.timezone, is_active: 1, staffing_config_json: '{}' };
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('SET event_location_name = ?, event_location_address = ?')) {
      expect(args.slice(2)).toEqual([15, 2]);
      stored.event_location_name = args[0]; stored.event_location_address = args[1];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO company_events')) return [{ insertId: 15 }];
    if (sql.includes('SELECT * FROM company_events')) return [[{ ...stored }]];
    if (sql.includes('SELECT sp.school_organization_id AS id')) return [[{ id: 12 }]];
    return [[]];
  });
});

describe('outreach and school editor venue persistence', () => {
  it.each([null, 'D11'])('saves and returns a venue for new outreach (district %s)', async districtName => {
    const result = await createDistrictOutreachEvent({ ...input, districtName });
    expect(result).toMatchObject({ eventLocationName: 'Community center', eventLocationAddress: address });
    expect(stored.event_location_address).toBe(address);
    expect(m.materialize).toHaveBeenCalled();
  });
  it('repairs an existing outreach event and keeps its address through later unrelated edits', async () => {
    expect((await updateDistrictOutreachEvent(input)).eventLocationAddress).toBe(address);
    const result = await updateDistrictOutreachEvent({ agencyId: 2, eventId: 15, userId: 7, title: 'New title' });
    expect(result.eventLocationAddress).toBe(address);
    expect(m.execute.mock.calls.filter(([sql]) => sql.includes('SET event_location_name'))).toHaveLength(1);
  });
  it.each([createSchoolPortalEvent, updateSchoolPortalEvent])('stores off-campus school event venues through the school editor', async save => {
    stored.organization_id = 12; stored.event_type = 'school_other';
    const result = await save({ ...input, organizationId: 12 });
    expect(result).toMatchObject({ eventLocationName: 'Community center', eventLocationAddress: address });
  });
  it('rejects an explicitly blank outreach address before changing any event data', async () => {
    await expect(updateDistrictOutreachEvent({ ...input, eventVenue: { eventLocationAddress: '  ' } })).rejects.toMatchObject({ status: 400 });
    expect(m.execute.mock.calls.every(([sql]) => !sql.includes('UPDATE company_events'))).toBe(true);
  });
  it('returns a pre-existing public venue address to the editor', () => {
    expect(mapSchoolEventRow({ ...stored, public_location_address: address }).eventLocationAddress).toBe(address);
  });
  it('preserves omitted address fields when only the venue name is changed', async () => {
    const venue = await prepareEventVenueUpdate({ body: { eventLocationName: 'Updated venue' }, existing: { event_location_address: address }, requireAddress: true });
    expect(venue).toEqual({ name: 'Updated venue', address });
    await saveEventVenue({ eventId: 15, agencyId: 2, venue });
    expect(stored.event_location_address).toBe(address);
  });
  it('does not touch a saved address for older editors that omit venue fields', async () => {
    const venue = await prepareEventVenueUpdate({ body: { title: 'Updated title' }, existing: { event_location_address: address } });
    await saveEventVenue({ eventId: 15, agencyId: 2, venue });
    expect(m.execute).not.toHaveBeenCalled();
  });
});
