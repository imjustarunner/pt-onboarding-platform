import { beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({ execute: vi.fn(), sms: vi.fn(), prepare: vi.fn(), notification: vi.fn(), communication: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute, query: mock.execute }, onTableWrite: vi.fn() }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: async () => true }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveScopedAgencyIdsForMyDashboard: async () => [4] }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 4, feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true, companyEventsSenderNumberId: 8 } }) } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { coalesceOrCreate: mock.notification } }));
vi.mock('../../models/UserCommunication.model.js', () => ({ default: { create: mock.communication, updateDeliveryStatus: vi.fn() } }));
vi.mock('../../services/vonage.service.js', () => ({ default: { sendSms: mock.sms } }));
vi.mock('../../services/smsCompliance.service.js', () => ({ prepareSmsDelivery: mock.prepare, getSmsSender: async () => ({ id: 8, agency_id: 4, scope: 'number:8', registration: { purposes: ['polling'] } }) }));
vi.mock('../../utils/smsCompliancePolicy.js', () => ({ validateSmsRegistration: () => [] }));
import * as controller from '../companyEvents.controller.js';
let event, users, replies;
const member = { id: 2, first_name: 'Taylor', role: 'provider', is_active: 1, membership_active: 1, status: 'ACTIVE_EMPLOYEE', personal_phone: '+13035550101' };
const req = () => ({ user: { id: 2, role: 'admin' }, params: { id: '4', eventId: '20' }, query: {}, body: {}, path: '/4/company-events/20/send-poll' });
async function invoke(name, request = req()) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, next = vi.fn();
  await controller[name](request, res, next); expect(next).not.toHaveBeenCalled(); return res;
}
beforeEach(() => {
  vi.clearAllMocks(); replies = new Map();
  users = [member, { ...member, id: 3, personal_phone: '+13035550103', status: 'INACTIVE_EMPLOYEE' }, { ...member, id: 4, personal_phone: '+13035550104', role: 'school_staff' }, { ...member, id: 5, personal_phone: '+13035550105', notification_categories: { staff_communications_4: { choices: { polling: false } } } }];
  event = { id: 20, agency_id: 4, event_type: 'team_poll', title: 'Team date', starts_at: '2026-01-01T12:00:00Z', ends_at: '2099-01-01T12:00:00Z', is_active: 1, sms_code: 'DATE', voting_config_json: { enabled: true, deliveryMode: 'both', viaSms: true, options: [{ key: '1', label: 'Tuesday' }, { key: '2', label: 'Friday' }] } };
  mock.sms.mockResolvedValue({ sid: 'mock-sms' }); mock.prepare.mockResolvedValue({}); mock.communication.mockResolvedValue({ id: 90 });
  mock.execute.mockImplementation(async (sql, args = []) => {
    if (sql.includes('FROM users u JOIN user_agencies ua')) return [users.filter(u => !sql.includes('AND u.id = ?') || u.id === args[1])];
    if (sql.includes('FROM company_event_audiences')) return [users.map(u => ({ company_event_id: 20, audience_type: 'user', target_id: u.id }))];
    if (sql.includes('INSERT INTO company_event_responses')) { replies.set(args[1], { id: args[1], user_id: args[1], response_key: args[2], response_label: args[3], response_body: args[4] }); return [{ insertId: args[1] }]; }
    if (sql.includes('SELECT ce.*')) return [[{ ...event, participated: replies.has(2) ? 1 : 0 }]];
    if (sql.includes('FROM company_event_responses')) return [[...replies.values()].filter(r => !sql.includes('AND user_id = ?') || r.user_id === args[1])];
    if (sql.includes('INSERT INTO company_events')) return [{ insertId: 20 }];
    if (sql.includes('FROM company_events')) return [[event]];
    if (sql.includes('SELECT role FROM users')) return [[{ role: 'provider' }]];
    if (sql.includes('FROM twilio_numbers')) return [[{ phone_number: '+13035550100' }]];
    if (sql.includes('SELECT id, feature_flags FROM agencies')) return [[{ id: 4, feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true, companyEventsSenderNumberId: 8 } }]];
    return [[]];
  });
});
describe('team poll delivery and shared replies', () => {
  it('creates an SMS poll with a generated reply code', async () => {
    const request = req();
    request.body = { title: 'Team date', eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at, audience: { userIds: [2] }, votingConfig: { ...event.voting_config_json, deliveryMode: 'sms' } };
    const res = await invoke('createCompanyEvent', request);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO company_events'), expect.arrayContaining([expect.stringMatching(/^P[A-F0-9]{10}$/)]));
    expect(mock.sms).not.toHaveBeenCalled();
  });
  it('rejects an inactive recipient injected into the save API', async () => {
    const request = req();
    request.body = { title: 'Team date', eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at, audience: { userIds: [3] }, votingConfig: event.voting_config_json };
    const next = vi.fn();
    await controller.createCompanyEvent(request, { status: vi.fn().mockReturnThis(), json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(mock.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO company_events'))).toBe(false);
  });

  it('sends Both internally to active staff and texts only polling opt-ins', async () => {
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sentCount: 1, inAppCount: 2, skippedCount: 1 }));
    expect(mock.notification.mock.calls.map(([n]) => n.userId)).toEqual([2, 5]);
    expect(mock.sms).toHaveBeenCalledTimes(1);
    expect(mock.sms).toHaveBeenCalledWith(expect.objectContaining({ to: member.personal_phone, purpose: 'polling' }));
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO company_event_dispatch_logs'), expect.arrayContaining(['skipped', 'SMS opted out']));
  });
  it('delivers internal polls without an SMS sender or consent check', async () => {
    event.voting_config_json.deliveryMode = 'internal';
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sentCount: 0, inAppCount: 2 }));
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('does not create internal notifications for SMS-only polls', async () => {
    event.voting_config_json.deliveryMode = 'sms'; await invoke('sendCompanyEventVotingSms');
    expect(mock.notification).not.toHaveBeenCalled(); expect(mock.sms).toHaveBeenCalledTimes(1);
  });
  it('does not reinvite someone who already replied', async () => {
    replies.set(2, { id: 1, user_id: 2 }); await invoke('sendCompanyEventVotingSms');
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.notification.mock.calls.map(([n]) => n.userId)).toEqual([5]);
  });
  it('rejects ordinary workforce delivery for polls', async () => {
    const res = await invoke('sendCompanyEventDirectMessage'); expect(res.status).toHaveBeenCalledWith(400);
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.notification).not.toHaveBeenCalled();
  });
  it('removes pending poll and notification after an SMS reply, retaining history', async () => {
    let res = await invoke('listMyCompanyEvents'); expect(res.json.mock.calls[0][0]).toHaveLength(1);
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toMatchObject({ handled: true });
    expect(replies.get(2)).toMatchObject({ response_key: '1' });
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE notifications SET is_read'), [2, 20]);
    res = await invoke('listMyCompanyEvents'); expect(res.json).toHaveBeenCalledWith([]);
    res = await invoke('listMyStaffPolls'); expect(res.json.mock.calls[0][0][0].myResponse).toMatchObject({ original: '1' });
  });
  it('uses one response record across internal and SMS replies', async () => {
    const request = req(); request.body.responseKey = '2'; await invoke('respondToMyCompanyEvent', request);
    expect(replies.get(2).response_key).toBe('2');
    await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' });
    expect(replies.size).toBe(1); expect(replies.get(2).response_key).toBe('1');
  });
  it('does not expose or accept internal votes for SMS-only polls', async () => {
    event.voting_config_json.deliveryMode = 'sms';
    const list = await invoke('listMyCompanyEvents'); expect(list.json).toHaveBeenCalledWith([]);
    const polls = await invoke('listMyStaffPolls'); expect(polls.json).toHaveBeenCalledWith([]);
    const request = req(); request.body.responseKey = '1';
    const response = await invoke('respondToMyCompanyEvent', request); expect(response.status).toHaveBeenCalledWith(400); expect(replies.size).toBe(0);
  });
  it.each([{ status: 'INACTIVE_EMPLOYEE' }, { role: 'school_staff' }, { membership_active: 0 }])('blocks stale explicit audiences for %j', async change => {
    users[0] = { ...member, ...change };
    const list = await invoke('listMyStaffPolls'); expect(list.json).toHaveBeenCalledWith([]);
    const request = req(); request.body.responseKey = '1';
    const res = await invoke('respondToMyCompanyEvent', request); expect(res.status).toHaveBeenCalledWith(404);
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toBeNull();
  });
});
