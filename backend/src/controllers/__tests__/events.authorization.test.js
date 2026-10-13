import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: vi.fn(async () => true) }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, organization_type: 'agency' })) } }));
import pool from '../../config/database.js';
import { exportCompanyEventsDirectoryRosterPdf, listCompanyEventAudienceOptions, sendCompanyEventDirectMessage } from '../companyEvents.controller.js';
import { respondToCompanyEventStaffLink } from '../companyEventStaffLink.controller.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => vi.clearAllMocks());
it('a coordinator cannot use a query parameter to export unrelated event rosters', async () => {
  const req = { params: { id: '2' }, query: { eventId: '12' }, user: { id: 7, role: 'provider' } };
  pool.execute.mockResolvedValue([[{ id: 1 }]]);
  const res = response(), next = vi.fn();
  await exportCompanyEventsDirectoryRosterPdf(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});
it('staff link records interest without assigning staff or claiming attendance', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('FROM company_events') ? [[{
    id: 12, agency_id: 2, ends_at: '2099-01-01', staff_link_token: 'a'.repeat(48)
  }]] : sql.includes('FROM user_agencies') ? [[{ id: 7 }]] : [{ affectedRows: 1 }]);
  const res = response(), next = vi.fn();
  await respondToCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 7 }, body: { response: 'yes' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ assigned: false, response: 'yes' }));
  expect(pool.execute.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(/INSERT INTO .*assignments|INSERT INTO .*punches|payroll_time_claims/);
});
it('a forwarded staff link does not allow a non-staff account to RSVP as an employee', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('FROM company_events') ? [[{ id: 12, agency_id: 2, ends_at: '2099-01-01' }]] : [[]]);
  const res = response();
  await respondToCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 99 }, body: { response: 'yes' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
});

for (const scenario of [
  { title: 'lets a delegated coordinator prepare messages for their own event', assigned: true, type: 'company_event', expected: 400 },
  { title: 'does not extend coordinator access to another event', assigned: false, type: 'company_event', expected: 403 },
  { title: 'keeps generic team polls restricted to Conversa managers', assigned: true, type: 'team_poll', expected: 403 }
]) it(scenario.title, async () => {
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM company_event_coordinators')) return [scenario.assigned ? [{ id: 1 }] : []];
    if (sql.includes('FROM company_events')) return [[{ id: 12, agency_id: 2, event_type: scenario.type, starts_at: '2099-01-01T12:00:00Z', ends_at: '2099-01-01T13:00:00Z' }]];
    return [[]];
  });
  const res = response(), next = vi.fn();
  await sendCompanyEventDirectMessage({ params: { id: '2', eventId: '12' }, user: { id: 7, role: 'provider' }, body: { message: 'Event details', sendSms: false }, query: {} }, res, next);
  if (scenario.expected === 403) expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  else {
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: { message: 'No eligible staff found for this event audience' } }));
  }
  expect(pool.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(false);
});
