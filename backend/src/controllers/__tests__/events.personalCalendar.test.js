import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ audience: vi.fn(), potluck: vi.fn(), rsvps: new Map() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveScopedAgencyIdsForMyDashboard: vi.fn(async () => [2]) }));
vi.mock('../../services/companyEventAudience.service.js', async original => ({ ...await original(), resolveCompanyEventAudienceUserIds: m.audience }));
vi.mock('../../services/conversaTeamRecipients.service.js', async original => ({ ...await original(), listActiveTeamMembers: vi.fn(async () => [{ id: 7 }]) }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));
vi.mock('../../services/staffEventPotluck.service.js', () => ({ saveStaffPotluckContribution: m.potluck }));
import pool from '../../config/database.js';
import { listMyCompanyEvents, listMyCompanyEventsCalendar, respondToMyCompanyEvent } from '../companyEvents.controller.js';

const request = { user: { id: 7, role: 'provider' }, headers: {}, params: {}, query: {} };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const base = { agency_id: 2, event_type: 'company_event', organization_id: null, is_active: 1, title: 'Company gathering',
  starts_at: '2030-02-01T18:00:00Z', ends_at: '2030-02-01T20:00:00Z', staff_link_token: 'a'.repeat(48), rsvp_mode: 'yes_no_maybe', timezone: 'America/Denver' };
const companies = [
  { ...base, id: 1 }, { ...base, id: 2, agency_id: 3, operations_json: { invitedAgencyIds: [2], mandatoryUserIds: [7] } },
  { ...base, id: 3 }, { ...base, id: 4 }, { ...base, id: 5, starts_at: null, ends_at: null, operations_json: { dateToBeDecided: true } }, { ...base, id: 6 }
];
const school = { ...base, id: 80, event_type: 'school_outreach', outreach_table_invited: 1, is_provider_school: 1 };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  m.potluck.mockResolvedValue(); for (const event of companies) delete event.potluck_enabled;
  m.audience.mockImplementation(async ({ event }) => Number(event.id) === 6 ? [] : [7]);
  m.rsvps = new Map([[1,'yes'],[2,'maybe'],[3,'no'],[5,'yes'],[6,'yes']]);
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT ce.* FROM company_events ce')) return [companies];
    if (sql.includes('FROM company_events ce') && !sql.startsWith('SELECT ce.id AS company_event_id')) return [[school]];
    if (sql.startsWith('SELECT ce.id AS company_event_id')) return [[...m.rsvps].map(([company_event_id,response_key]) => ({ company_event_id,response_key }))];
    if (sql.includes('FROM company_event_audiences') || sql.includes('FROM skills_group_providers')) return [[]];
    if (sql.includes('SELECT role FROM users')) return [[{ role: 'provider' }]];
    if (sql.includes('FROM company_event_responses')) return [[...m.rsvps].map(([company_event_id,response_key]) => ({ company_event_id,user_id:7,response_key,response_label:response_key }))];
    if (sql.includes('INSERT INTO company_event_responses')) { m.rsvps.set(Number(args[0]),args[2]); return [{ affectedRows: 1 }]; }
    if (/^\s*UPDATE/.test(sql)) return [{ affectedRows: 1 }];
    if (sql.includes('FROM company_event_session_dates') || sql.includes('FROM company_event_session_providers') || sql.includes('FROM company_event_session_provider_requests')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
afterEach(() => vi.useRealTimers());

it('keeps unanswered, Yes, Maybe, No and undated invitations on the dashboard with normalized personal metadata', async () => {
  const res = response(), next = vi.fn(); await listMyCompanyEvents(request,res,next);
  expect(next).not.toHaveBeenCalled(); const events = res.json.mock.calls[0][0];
  expect(events.map(event => event.id)).toEqual([80,1,2,3,4,5]);
  expect(events.find(event => event.id === 3)).toMatchObject({ isInvitedCompanyEvent: true, myRsvp: 'no', canRsvp: true });
  expect(events.find(event => event.id === 4)).toMatchObject({ myRsvp: null });
  expect(events.find(event => event.id === 5)).toMatchObject({ dateToBeDecided: true, startsAt: null });
  expect(events.find(event => event.id === 2)).toMatchObject({ agencyId: 3, mandatory: true, staffPageUrl: expect.stringContaining('/staff/') });
});
it('shows only current Yes/Maybe ordinary invitations on calendars while preserving school events', async () => {
  const res = response(), next = vi.fn(); await listMyCompanyEventsCalendar(request,res,next);
  expect(next).not.toHaveBeenCalled(); const events = res.json.mock.calls[0][0];
  expect(events.map(event => event.id)).toEqual([80,1,2]);
  expect(events.find(event => event.id === 2)).toMatchObject({ myRsvp: 'maybe', calendarStatus: 'tentative', canRsvp: true });
  expect(events.find(event => event.id === 80).isInvitedCompanyEvent).toBe(false);
});
it('accepts ordinary RSVP changes independently of polls and updates the invitation so reminders stop', async () => {
  const res = response(), next = vi.fn();
  await respondToMyCompanyEvent({ ...request, params: { eventId: '2' }, body: { response: 'no', agencyId: 3 } },res,next);
  expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith({ ok:true,response:'no',myRsvp:'no',responseKey:'no',responseLabel:'No' });
  expect(pool.execute.mock.calls).toContainEqual(['UPDATE company_event_invitations SET response=?,responded_at=NOW() WHERE company_event_id=? AND user_id=?',['no',2,7]]);
  const calendar = response(); await listMyCompanyEventsCalendar(request,calendar,next);
  expect(calendar.json.mock.calls[0][0].map(event => event.id)).toEqual([80,1]);
  const change = response(); await respondToMyCompanyEvent({ ...request, params: { eventId: '2' }, body: { response: 'maybe' } },change,next);
  expect(change.json).toHaveBeenCalledWith(expect.objectContaining({ response:'maybe' }));
});
it('rejects RSVP writes after removal from the active event audience', async () => {
  const res = response(), next = vi.fn(); await respondToMyCompanyEvent({ ...request, params: { eventId: '6' }, body: { response:'yes' } },res,next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(404);
  expect(pool.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  expect(m.potluck).not.toHaveBeenCalled();
});
it.each(['no','maybe'])('releases a potluck contribution when a current cross-agency invitee changes RSVP to %s', async choice => {
  companies[1].potluck_enabled = 1;
  const res = response(), next = vi.fn();
  await respondToMyCompanyEvent({ ...request, params: { eventId: '2' }, body: { response: choice } },res,next);
  expect(next).not.toHaveBeenCalled();
  expect(m.potluck).toHaveBeenCalledWith({ eventId:2,agencyId:3,userId:7,itemId:null,customItemName:'' });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ response:choice }));
});
