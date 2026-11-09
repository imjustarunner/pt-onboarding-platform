import { beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({ execute: vi.fn(), sms: vi.fn(), email: vi.fn(), agency: vi.fn(), prepare: vi.fn(), notification: vi.fn(), communication: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute, query: mock.execute }, onTableWrite: vi.fn() }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: async () => true }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveScopedAgencyIdsForMyDashboard: async () => [4] }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mock.agency } }));
vi.mock('../../services/unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: mock.email, sendEmailFromIdentity: vi.fn() }));
vi.mock('../../models/Notification.model.js', () => ({ default: { coalesceOrCreate: mock.notification } }));
vi.mock('../../models/UserCommunication.model.js', () => ({ default: { create: mock.communication, updateDeliveryStatus: vi.fn() } }));
vi.mock('../../services/vonage.service.js', () => ({ default: { sendSms: mock.sms } }));
vi.mock('../../services/smsCompliance.service.js', () => ({ prepareSmsDelivery: mock.prepare, getSmsSender: async () => ({ id: 8, agency_id: 4, scope: 'number:8', registration: { purposes: ['polling'] } }) }));
vi.mock('../../services/companyEventOperations.service.js', () => ({
  isEventCoordinator: vi.fn(async () => false), validateEventOperations: vi.fn(async () => ({})), saveEventOperations: vi.fn()
}));
vi.mock('../../services/companyEventSms.service.js', () => ({
  resolveCompanyEventSmsSender: vi.fn(async () => ({ sender: { id: 8, phone_number: '+13035550100' }, campaignNumber: 2 })),
  sendCompanyEventSms: (...args) => mock.sms(...args), recordCompanyEventPollSmsResponse: vi.fn(),
  getCompanyEventSmsTopic: vi.fn(async () => '125'),
  isCompanyEventSmsMuted: vi.fn(async () => false)
}));
vi.mock('../../utils/smsCompliancePolicy.js', () => ({ validateSmsRegistration: () => [] }));
import * as controller from '../companyEvents.controller.js';
import { resolveCompanyEventSmsSender } from '../../services/companyEventSms.service.js';
let event, users, replies, emailInvited;
const member = { id: 2, first_name: 'Taylor', role: 'provider', is_active: 1, membership_active: 1, status: 'ACTIVE_EMPLOYEE', personal_phone: '+13035550101' };
const req = () => ({ user: { id: 2, role: 'admin' }, params: { id: '4', eventId: '20' }, query: {}, body: {}, path: '/4/company-events/20/send-poll' });
async function invoke(name, request = req()) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, next = vi.fn();
  await controller[name](request, res, next); expect(next).not.toHaveBeenCalled(); return res;
}
beforeEach(() => {
  vi.clearAllMocks(); replies = new Map(); emailInvited = new Set();
  mock.agency.mockResolvedValue({ id: 4, slug: 'itsco', feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true, companyEventsSenderNumberId: 8 } });
  mock.email.mockResolvedValue({ id: 'email-accepted' });
  users = [member, { ...member, id: 3, personal_phone: '+13035550103', status: 'INACTIVE_EMPLOYEE' }, { ...member, id: 4, personal_phone: '+13035550104', role: 'school_staff' }, { ...member, id: 5, personal_phone: '+13035550105', notification_categories: { staff_communications_4: { choices: { polling: false } } } }];
  event = { id: 20, agency_id: 4, event_type: 'team_poll', title: 'Team date', starts_at: '2026-01-01T12:00:00Z', ends_at: '2099-01-01T12:00:00Z', is_active: 1, sms_code: 'DATE', voting_config_json: { enabled: true, deliveryMode: 'both', viaSms: true, options: [{ key: '1', label: 'Tuesday' }, { key: '2', label: 'Friday' }] } };
  mock.sms.mockResolvedValue({ sid: 'mock-sms' }); mock.prepare.mockResolvedValue({}); mock.communication.mockResolvedValue({ id: 90 });
  mock.execute.mockImplementation(async (sql, args = []) => {
    if (sql.includes('INSERT INTO company_event_dispatch_logs') && args[2] === 'email' && args[5] === 'sent') emailInvited.add(args[1]);
    if (sql.includes('SELECT id FROM company_event_dispatch_logs')) return [emailInvited.has(Number(args[1])) ? [{ id: 1 }] : []];
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
  function ssoRecipients() {
    mock.agency.mockResolvedValue({ id: 4, slug: 'itsco', feature_flags: { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] } });
    users = [{ ...member, email: 'taylor@work.example', work_email: 'old@work.example', sso_password_override: 0, login_is_group_email: 0,
      notification_categories: { staff_communications_4: { choices: { polling: false } } } }];
  }
  it.each(['internal', 'sms', 'both'])('sends an SSO work-email voting invitation without poll-text consent for %s delivery', async mode => {
    ssoRecipients(); event.voting_config_json.deliveryMode = mode;
    const preview = await invoke('previewCompanyEventPollDelivery');
    expect(preview.json).toHaveBeenCalledWith(expect.objectContaining({ emailCount: 1, smsEligibleCount: 0, canSend: true }));
    expect(mock.email).not.toHaveBeenCalled();
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailCount: 1, sentCount: 0, failedCount: 0 }));
    expect(mock.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'taylor@work.example', userId: 2, templateType: 'staff_poll_invitation',
      html: expect.stringContaining('Opt in to vote by text') }));
    expect(mock.email.mock.calls[0][0].html).toContain('https://app.itsco.health/staff-polls/20?agencyId=4');
    expect(mock.sms).not.toHaveBeenCalled();
  });
  it('keeps enrolled SMS recipients off the fallback email path', async () => {
    ssoRecipients(); delete users[0].notification_categories;
    await invoke('sendCompanyEventVotingSms');
    expect(mock.sms).toHaveBeenCalledOnce(); expect(mock.email).not.toHaveBeenCalled();
  });
  it('does not send email or SMS to a recipient who already voted', async () => {
    ssoRecipients(); replies.set(2, { id: 1, user_id: 2 });
    await invoke('sendCompanyEventVotingSms');
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.email).not.toHaveBeenCalled();
  });
  it.each([{ skipped: true, reason: 'email_opted_out' }, { pendingApproval: true }, { blocked: true }])('does not call an unaccepted email sent: %j', async result => {
    ssoRecipients(); event.voting_config_json.deliveryMode = 'sms'; mock.email.mockResolvedValue(result);
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailCount: 0 }));
    expect(emailInvited.size).toBe(0);
    const request = req(); request.body.responseKey = '1';
    const vote = await invoke('respondToMyCompanyEvent', request);
    expect(vote.status).toHaveBeenCalledWith(400);
  });
  it('allows a signed-in email invitee to vote on an SMS poll without enrolling in SMS', async () => {
    ssoRecipients(); event.voting_config_json.deliveryMode = 'sms';
    await invoke('sendCompanyEventVotingSms');
    const list = await invoke('listMyStaffPolls'); expect(list.json.mock.calls[0][0]).toHaveLength(1);
    const request = req(); request.body.responseKey = '2';
    await invoke('respondToMyCompanyEvent', request);
    expect(replies.get(2)).toMatchObject({ response_key: '2' });
    expect(users[0].notification_categories.staff_communications_4.choices.polling).toBe(false);
    users = [];
    const denied = await invoke('respondToMyCompanyEvent', request);
    expect(denied.status).toHaveBeenCalledWith(404);
  });
  it('skips an email already sent when reviewing delivery after an edit', async () => {
    ssoRecipients(); event.voting_config_json.deliveryMode = 'sms';
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes('SELECT user_id, channel FROM company_event_dispatch_logs')
      ? Promise.resolve([[{ user_id: 2, channel: 'email' }]]) : original(sql, args));
    const request = req(); request.body.unsentOnly = true;
    await invoke('sendCompanyEventVotingSms', request);
    expect(mock.email).not.toHaveBeenCalled();
  });
  it('previews and sends only missing channels after editing an audience', async () => {
    users = [member, { ...member, id: 6, personal_phone: '+13035550106' }];
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes('FROM company_event_dispatch_logs')
      ? Promise.resolve([[{ user_id: 2, channel: 'in_app' }]]) : original(sql, args));
    const request = req(); request.query.unsentOnly = '1';
    const preview = await invoke('previewCompanyEventPollDelivery', request);
    expect(preview.json).toHaveBeenCalledWith(expect.objectContaining({ internalCount: 1, smsEligibleCount: 2, canSend: true }));
    request.query = {}; request.body.unsentOnly = true;
    const res = await invoke('sendCompanyEventVotingSms', request);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ inAppCount: 1, sentCount: 2 }));
    expect(mock.notification.mock.calls.map(([n]) => n.userId)).toEqual([6]);
  });
  it('does not re-send invitations already sent on every selected channel', async () => {
    users = [member];
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes('FROM company_event_dispatch_logs')
      ? Promise.resolve([[{ user_id: 2, channel: 'in_app' }, { user_id: 2, channel: 'sms' }]]) : original(sql, args));
    const request = req(); request.query.unsentOnly = '1';
    const preview = await invoke('previewCompanyEventPollDelivery', request);
    expect(preview.json).toHaveBeenCalledWith(expect.objectContaining({ internalCount: 0, smsEligibleCount: 0, alreadyNotifiedCount: 1, canSend: false }));
    request.body.unsentOnly = true;
    await invoke('sendCompanyEventVotingSms', request);
    expect(mock.notification).not.toHaveBeenCalled(); expect(mock.sms).not.toHaveBeenCalled();
  });
  it('creates an SMS poll without a separate long reply code', async () => {
    const request = req();
    request.body = { title: 'Team date', eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at, audience: { userIds: [2] }, votingConfig: { ...event.voting_config_json, deliveryMode: 'sms' } };
    const res = await invoke('createCompanyEvent', request);
    expect(res.status).toHaveBeenCalledWith(201);
    const [sql, args] = mock.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO company_events'));
    const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(value => value.trim());
    expect(args[columns.indexOf('sms_code')]).toBeNull();
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
  it.each([undefined, null])('preserves replies to old invitations when an edit omits the legacy code: %j', async smsCode => {
    const body = { title: 'Updated team date', eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at,
      audience: { userIds: [2] }, votingConfig: event.voting_config_json, smsCode };
    const result = await controller.persistCompanyEventUpdate(req(), 4, 20, body);
    expect(result.error).toBeUndefined();
    const [sql, args] = mock.execute.mock.calls.find(([sql]) => sql.includes('UPDATE company_events') && sql.includes('sms_code = ?'));
    const fields = sql.slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE')).split(',').map(value => value.trim().split(' ')[0]);
    expect(args[fields.indexOf('sms_code')]).toBe('DATE');
  });

  it('sends Both internally to active staff and texts only polling opt-ins', async () => {
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sentCount: 1, inAppCount: 2, skippedCount: 1 }));
    expect(mock.notification.mock.calls.map(([n]) => n.userId)).toEqual([2, 5]);
    expect(mock.sms).toHaveBeenCalledTimes(1);
    expect(mock.sms).toHaveBeenCalledWith(expect.objectContaining({ to: member.personal_phone, purpose: 'polling' }));
    expect(mock.sms.mock.calls[0][0].body).toContain('Reply 125 1');
    expect(mock.sms.mock.calls[0][0].body).not.toContain('DATE');
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO company_event_dispatch_logs'), expect.arrayContaining(['skipped', 'SMS opted out']));
  });
  it('previews the saved Both audience with honest channel counts and opt-out reasons without writes or sends', async () => {
    const res = await invoke('previewCompanyEventPollDelivery');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deliveryMode: 'both', canSend: true,
      audienceCount: 2, internalCount: 2, smsEligibleCount: 1, smsSkippedCount: 1, answeredCount: 0,
      smsSender: expect.objectContaining({ ready: true, fromNumber: '+13035550100' }),
      reasons: [{ code: 'sms_opted_out', label: 'SMS opted out', count: 1 }] }));
    expect(mock.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
    expect(mock.notification).not.toHaveBeenCalled(); expect(mock.sms).not.toHaveBeenCalled(); expect(mock.communication).not.toHaveBeenCalled();
  });
  it('excludes answered staff from preview and does not claim eligible SMS for an opted-out recipient', async () => {
    replies.set(2, { id: 2, user_id: 2 });
    event.voting_config_json.deliveryMode = 'sms';
    const res = await invoke('previewCompanyEventPollDelivery');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ answeredCount: 1, internalCount: 0, smsEligibleCount: 0, canSend: false }));
  });
  it('surfaces a global sender configuration problem before any partial delivery', async () => {
    resolveCompanyEventSmsSender.mockRejectedValueOnce(Object.assign(new Error('Missing sender'), { code: 'event_sms_sender_missing' }));
    let res = await invoke('previewCompanyEventPollDelivery');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canSend: false, smsEligibleCount: 0,
      smsSender: expect.objectContaining({ ready: false, reason: 'event_sms_sender_missing' }) }));
    resolveCompanyEventSmsSender.mockRejectedValueOnce(Object.assign(new Error('Missing sender'), { code: 'event_sms_sender_missing' }));
    res = await invoke('sendCompanyEventVotingSms'); expect(res.status).toHaveBeenCalledWith(409);
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.notification).not.toHaveBeenCalled();
  });
  it('rechecks opt-outs during actual dispatch after an earlier eligible preview', async () => {
    await invoke('previewCompanyEventPollDelivery');
    users[0] = { ...member, notification_categories: { staff_communications_4: { choices: { polling: false } } } };
    const res = await invoke('sendCompanyEventVotingSms');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sentCount: 0, inAppCount: 2,
      skippedReasons: [{ label: 'SMS opted out', count: 2 }] }));
    expect(mock.sms).not.toHaveBeenCalled();
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
  it('routes the short event number and the legacy code to the same poll response', async () => {
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: '125 2' })).toMatchObject({ handled: true, eventId: 20,
      responseMessage: 'Thanks! Recorded: Friday. Reply 125 to turn off texts about this event.' });
    expect(replies.get(2)).toMatchObject({ response_key: '2' });
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toMatchObject({ handled: true, eventId: 20 });
    expect(replies.size).toBe(1); expect(replies.get(2).response_key).toBe('1');
  });
  it('resolves inbound replies through the same current registered agency sender rather than missing legacy toggles', async () => {
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes('SELECT id, feature_flags FROM agencies')
      ? Promise.resolve([[{ id: 4, feature_flags: { companyEventsSenderNumberId: 8 } }]]) : original(sql, args));
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toMatchObject({ handled: true });
    expect(resolveCompanyEventSmsSender).toHaveBeenCalledWith({ agencyId: 4, audience: 'staff', purpose: 'polling', from: '+13035550100' });
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ? AND'), [4]);
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
