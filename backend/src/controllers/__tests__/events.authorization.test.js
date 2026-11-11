import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: vi.fn(async () => true) }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, organization_type: 'agency' })) } }));
import pool from '../../config/database.js';
import { exportCompanyEventsDirectoryRosterPdf, listCompanyEventAudienceOptions, sendCompanyEventDirectMessage } from '../companyEvents.controller.js';
import { getCompanyEventStaffLink, respondToCompanyEventStaffLink } from '../companyEventStaffLink.controller.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() });
const staff = (id, agencyId = 2) => ({ id, first_name: `Person ${id}`, last_name: 'Staff', role: 'provider', agency_id: agencyId, agency_name: `Agency ${agencyId}` });
function privateEventFixture({ event = {}, members = [staff(7)], audience = [] } = {}) {
  const record = { id: 12, agency_id: 2, is_active: 1, event_type: 'company_event', title: 'Second anniversary', ends_at: '2099-01-01', staff_link_token: 'a'.repeat(48), ...event };
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM company_events')) return [[record]];
    if (sql.includes('FROM users u JOIN user_agencies')) return [members];
    if (sql.includes('FROM company_event_audiences')) return [audience];
    if (sql.includes('FROM company_event_coordinators')) return [[]];
    if (sql.includes('FROM agencies WHERE id=')) return [[{ name: 'Inner Strength', logo_path: '/logo.png' }]];
    if (sql.includes('FROM company_event_responses')) return [[]];
    if (/^\s*(INSERT|UPDATE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected test database query: ${sql}`);
  });
  return record;
}
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
  privateEventFixture();
  const res = response(), next = vi.fn();
  await respondToCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 7 }, body: { response: 'yes' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ assigned: false, response: 'yes' }));
  expect(pool.execute.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(/INSERT INTO .*assignments|INSERT INTO .*punches|payroll_time_claims/);
  expect(pool.execute.mock.calls).toContainEqual([
    'UPDATE company_event_invitations SET response=?,responded_at=NOW() WHERE company_event_id=? AND user_id=?',
    ['yes', 12, 7]
  ]);
});
it('a forwarded staff link does not allow a non-staff account to RSVP as an employee', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('FROM company_events') ? [[{ id: 12, agency_id: 2, ends_at: '2099-01-01' }]] : [[]]);
  const res = response();
  await respondToCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 99 }, body: { response: 'yes' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
});

it('does not expose a forwarded private event page to uninvited active staff', async () => {
  privateEventFixture({ members: [staff(7), staff(99)], audience: [{ audience_type: 'user', target_id: 7 }] });
  const res = response(), next = vi.fn();
  await getCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 99, role: 'provider' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: { message: 'This private page is available to event invitees and coordinators.' } });
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SELECT name,logo_path'))).toBe(false);
});

it('allows an active invitee from a selected second agency to read the same private event', async () => {
  privateEventFixture({ event: { operations_json: { invitedAgencyIds: [3], mandatoryUserIds: [7] } }, members: [staff(7, 3)], audience: [{ audience_type: 'user', target_id: 7 }] });
  const res = response(), next = vi.fn();
  await getCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 7, role: 'provider' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ event: expect.objectContaining({ title: 'Second anniversary', mandatory: true }) }));
  expect(pool.execute.mock.calls.find(([sql]) => sql.includes('FROM users u JOIN user_agencies'))[1]).toEqual([2, 3]);
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

it('keeps undated social RSVPs open after an associated poll closes and updates invitation response', async () => {
  privateEventFixture({ event: { starts_at: null, ends_at: null, voting_closed_at: '2026-01-01', operations_json: { dateToBeDecided: true, isWorkEvent: false } } });
  const res = response(), next = vi.fn();
  await respondToCompanyEventStaffLink({ params: { id: '12', token: 'a'.repeat(48) }, user: { id: 7, role: 'provider' }, body: { response: 'maybe' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ response: 'maybe', assigned: false }));
  const queries = pool.execute.mock.calls;
  expect(queries).toContainEqual([
    'UPDATE company_event_invitations SET response=?,responded_at=NOW() WHERE company_event_id=? AND user_id=?', ['maybe', 12, 7]
  ]);
  expect(queries.find(([sql]) => sql.includes('INSERT INTO company_event_responses'))[1]).toEqual([12, 7, 'maybe', 'Maybe', 'maybe']);
  expect(queries.some(([sql]) => sql.includes('payroll') || sql.includes('punches'))).toBe(false);
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
