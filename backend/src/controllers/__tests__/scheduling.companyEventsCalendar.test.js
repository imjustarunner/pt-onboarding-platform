import { beforeEach, expect, it, vi } from 'vitest';
import pool from '../../config/database.js';
import { resolveScopedAgencyIdsForMyDashboard } from '../../utils/meDashboardTenantScope.js';
import { listMyCompanyEventsCalendar } from '../companyEvents.controller.js';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveScopedAgencyIdsForMyDashboard: vi.fn() }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));

const request = { user: { id: 7, role: 'provider' }, headers: {} };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  resolveScopedAgencyIdsForMyDashboard.mockResolvedValue([2]);
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM company_event_audiences')) return [[]];
    if (sql.includes('FROM skills_group_providers')) return [[{ group_id: 50 }]];
    if (sql.includes('SELECT role FROM users')) return [[{ role: 'provider' }]];
    if (sql.includes('FROM company_events ce')) return [[{
      id: 10,
      agency_id: 2,
      title: 'School outreach',
      event_type: 'school_outreach',
      starts_at: '2030-10-09T14:00:00Z',
      ends_at: '2030-10-09T18:00:00Z',
      outreach_table_invited: 1,
      staffing_config_json: JSON.stringify({ enabled: true, minProvidersPerSession: 2 })
    }]];
    if (sql.includes('FROM company_event_session_dates')) return [[{
      company_event_id: 10, session_date_id: 20, session_date: '2030-10-09',
      starts_at: '2030-10-09T14:00:00Z', ends_at: '2030-10-09T18:00:00Z'
    }]];
    if (sql.includes('COUNT(*) AS approved_count')) return [[{
      company_event_id: 10, session_date_id: 20, approved_count: 1
    }]];
    if (sql.includes('FROM company_event_session_provider_requests')) return [[{
      id: 30, company_event_id: 10, session_date_id: 20, status: 'pending', request_type: 'regular'
    }]];
    if (sql.includes('assignment_status')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
});

it('loads requestable events and the provider’s pending request for the calendar refresh', async () => {
  const res = response();
  const next = vi.fn();
  await listMyCompanyEventsCalendar(request, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([expect.objectContaining({
    id: 10, agencyId: 2, canRequestOutreachShift: true,
    sessions: [expect.objectContaining({
      sessionDateId: 20, requiredProviders: 2, approvedProvidersCount: 1,
      myRequest: { id: 30, status: 'pending', requestType: 'regular' }, myAssignment: null
    })]
  })]);
  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('ce.ends_at >= NOW()');
  expect(sql).not.toContain('OR ce.event_type IN');
  expect(sql).toContain("NOT IN ('canceled', 'cancelled')");
  expect(params).toEqual([7, 7, 7, 2]);
  expect(pool.execute.mock.calls.find(([query]) => query.includes('FROM company_event_session_provider_requests'))[1])
    .toEqual([10, 7]);
});

it('respects user, role, and group audiences while keeping the provider’s assigned events', async () => {
  const execute = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM company_events ce')) return [[1, 2, 3, 4, 5, 6].map((id) => ({
      id, agency_id: 2, title: `Event ${id}`, event_type: 'company_event',
      starts_at: '2030-10-09T14:00:00Z', ends_at: '2030-10-09T18:00:00Z',
      is_assigned_provider: id === 6 ? 1 : 0
    }))];
    if (sql.includes('FROM company_event_audiences')) return [[
      { company_event_id: 2, audience_type: 'user', target_id: 99 },
      { company_event_id: 3, audience_type: 'user', target_id: 7 },
      { company_event_id: 4, audience_type: 'role', target_id: 1 },
      { company_event_id: 5, audience_type: 'group', target_id: 50 },
      { company_event_id: 6, audience_type: 'user', target_id: 99 }
    ]];
    return execute(sql, params);
  });
  const res = response(), next = vi.fn();
  await listMyCompanyEventsCalendar(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].map((event) => event.id)).toEqual([1, 3, 4, 5, 6]);
});

it('limits school calendar dates to the provider’s schools and never makes them requestable', async () => {
  const execute = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM company_events ce')) return [[
      { id: 1, event_type: 'school_day_off', is_provider_school: 0 },
      { id: 2, event_type: 'school_day_off', is_provider_school: 1 },
      { id: 3, event_type: 'school_first_day', is_provider_school: 1 },
      { id: 4, event_type: 'school_outreach', outreach_table_invited: 1 }
    ].map((row) => ({
      agency_id: 2, title: 'School date', starts_at: '2030-10-09T14:00:00Z', ends_at: '2030-10-09T18:00:00Z',
      staffing_config_json: JSON.stringify({ enabled: true }), ...row
    }))];
    return execute(sql, params);
  });
  const res = response(), next = vi.fn();
  await listMyCompanyEventsCalendar(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].map(({ id, calendarOnly, canRequestOutreachShift }) => ({ id, calendarOnly, canRequestOutreachShift })))
    .toEqual([
      { id: 2, calendarOnly: true, canRequestOutreachShift: false },
      { id: 3, calendarOnly: true, canRequestOutreachShift: false },
      { id: 4, calendarOnly: false, canRequestOutreachShift: true }
    ]);
});

it('returns an empty calendar when there are no events', async () => {
  pool.execute.mockResolvedValue([[]]);
  const res = response();
  const next = vi.fn();
  await listMyCompanyEventsCalendar(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([]);
  expect(pool.execute).toHaveBeenCalledTimes(1);
});

it('does not query events when the provider has no scoped agencies', async () => {
  resolveScopedAgencyIdsForMyDashboard.mockResolvedValue([]);
  const res = response();
  const next = vi.fn();
  await listMyCompanyEventsCalendar(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([]);
  expect(pool.execute).not.toHaveBeenCalled();
});
