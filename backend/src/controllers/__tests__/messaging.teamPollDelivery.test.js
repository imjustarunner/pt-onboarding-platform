import { beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), sms: vi.fn(), email: vi.fn(), agency: vi.fn(), prepare: vi.fn(), notification: vi.fn(), communication: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute, query: mock.execute, getConnection: mock.getConnection }, onTableWrite: vi.fn() }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: async () => true }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveScopedAgencyIdsForMyDashboard: async () => [4] }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 8, role: 'admin' })) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mock.agency } }));
vi.mock('../../services/unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: mock.email, sendEmailFromIdentity: vi.fn() }));
vi.mock('../../models/Notification.model.js', () => ({ default: { coalesceOrCreate: mock.notification, create: mock.notification } }));
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
  isCompanyEventSmsMuted: vi.fn(async () => false), getCompanyEventSmsReport: vi.fn(async () => ({ deliveries: [] }))
}));
vi.mock('../../utils/smsCompliancePolicy.js', () => ({ validateSmsRegistration: () => [] }));
import * as controller from '../companyEvents.controller.js';
import { resolveCompanyEventSmsSender } from '../../services/companyEventSms.service.js';
let event, users, replies, emailInvited, linkedEvents, linkedAudiences;
const member = { id: 2, first_name: 'Taylor', role: 'provider', is_active: 1, membership_active: 1, status: 'ACTIVE_EMPLOYEE', personal_phone: '+13035550101' };
const req = () => ({ user: { id: 2, role: 'admin' }, params: { id: '4', eventId: '20' }, query: {}, body: {}, path: '/4/company-events/20/send-poll' });
async function invoke(name, request = req()) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, next = vi.fn();
  await controller[name](request, res, next); expect(next).not.toHaveBeenCalled(); return res;
}
async function pollsForParticipant() { const request = req(); request.user.role = 'provider'; return invoke('listMyStaffPolls', request); }
beforeEach(() => {
  vi.clearAllMocks(); replies = new Map(); emailInvited = new Set();
  linkedEvents = new Map(); linkedAudiences = new Map();
  mock.getConnection.mockResolvedValue({ execute: mock.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() });
  mock.agency.mockResolvedValue({ id: 4, slug: 'itsco', feature_flags: { smsNumbersEnabled: true, companyEventsEnabled: true, companyEventsSenderNumberId: 8 } });
  mock.email.mockResolvedValue({ id: 'email-accepted' });
  users = [member, { ...member, id: 3, personal_phone: '+13035550103', status: 'INACTIVE_EMPLOYEE' }, { ...member, id: 4, personal_phone: '+13035550104', role: 'school_staff' }, { ...member, id: 5, personal_phone: '+13035550105', notification_categories: { staff_communications_4: { choices: { polling: false } } } }];
  event = { id: 20, agency_id: 4, event_type: 'team_poll', title: 'Team date', starts_at: '2026-01-01T12:00:00Z', ends_at: '2099-01-01T12:00:00Z', is_active: 1, sms_code: 'DATE', voting_config_json: { enabled: true, deliveryMode: 'both', viaSms: true, options: [{ key: '1', label: 'Tuesday' }, { key: '2', label: 'Friday' }] } };
  mock.sms.mockResolvedValue({ sid: 'mock-sms' }); mock.prepare.mockResolvedValue({}); mock.communication.mockResolvedValue({ id: 90 });
  mock.execute.mockImplementation(async (sql, args = []) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('INSERT INTO company_event_dispatch_logs') && args[2] === 'email' && args[5] === 'sent') emailInvited.add(args[1]);
    if (sql.includes('SELECT id FROM company_event_dispatch_logs')) return [emailInvited.has(Number(args[1])) ? [{ id: 1 }] : []];
    if (sql.includes('FROM users u JOIN user_agencies ua')) return [users.filter(u => !sql.includes('AND u.id = ?') || u.id === args[1])];
    if (sql.includes('FROM company_event_audiences')) return [[...users.map(u => ({ company_event_id: 20, audience_type: 'user', target_id: u.id })),
      ...[...linkedEvents.keys()].flatMap(id => (linkedAudiences.get(id) || [2]).map(userId => ({ company_event_id: id, audience_type: 'user', target_id: userId })))]];
    if (sql.includes('INSERT INTO company_event_responses')) { replies.set(args[1], { id: args[1], user_id: args[1], response_key: args[2], response_label: args[3], response_body: args[4] }); return [{ insertId: args[1] }]; }
    if (sql.includes('SELECT ce.*')) return [[{ ...event, participated: replies.has(2) ? 1 : 0 }, ...[...linkedEvents.values()].filter(row => row.agency_id === 4 && row.is_active)]];
    if (sql.includes('FROM company_event_responses')) return [[...replies.values()].filter(r => !sql.includes('AND user_id = ?') || r.user_id === args[1])];
    if (sql.includes('INSERT INTO company_events')) return [{ insertId: 20 }];
    if (sql.includes('FROM company_events')) {
      if (sql.includes('WHERE agency_id = ?')) return [[event, ...linkedEvents.values()].filter(row => row.agency_id === Number(args[0]))];
      const target = Number(args[0]) === 20 ? event : linkedEvents.get(Number(args[0]));
      return [target && (!sql.includes('AND agency_id = ?') || Number(args[1]) === target.agency_id) ? [target] : []];
    }
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
    const list = await pollsForParticipant(); expect(list.json.mock.calls[0][0]).toHaveLength(1);
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
    let res = await invoke('listMyCompanyEvents'); expect(res.json.mock.calls[0][0]).toHaveLength(0);
    res = await pollsForParticipant(); expect(res.json.mock.calls[0][0]).toHaveLength(1);
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toMatchObject({ handled: true });
    expect(replies.get(2)).toMatchObject({ response_key: '1' });
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE notifications SET is_read'), [2, 20]);
    res = await invoke('listMyCompanyEvents'); expect(res.json).toHaveBeenCalledWith([]);
    res = await pollsForParticipant(); expect(res.json.mock.calls[0][0][0].myResponse).toMatchObject({ original: '1' });
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
    const polls = await pollsForParticipant(); expect(polls.json).toHaveBeenCalledWith([]);
    const request = req(); request.body.responseKey = '1';
    const response = await invoke('respondToMyCompanyEvent', request); expect(response.status).toHaveBeenCalledWith(400); expect(replies.size).toBe(0);
  });
  it.each([{ status: 'INACTIVE_EMPLOYEE' }, { role: 'school_staff' }, { membership_active: 0 }])('blocks stale explicit audiences for %j', async change => {
    users[0] = { ...member, ...change };
    const list = await pollsForParticipant(); expect(list.json).toHaveBeenCalledWith([]);
    const request = req(); request.body.responseKey = '1';
    const res = await invoke('respondToMyCompanyEvent', request); expect(res.status).toHaveBeenCalledWith(404);
    expect(await controller.handleCompanyEventInbound({ from: member.personal_phone, to: '+13035550100', body: 'DATE 1' })).toBeNull();
  });
});

describe('Conversa participant poll presentation and internal event links', () => {
  function linked(patch = {}) {
    const row = { ...event, id: 90, title: 'Team dinner', event_type: 'company_event', voting_config_json: { enabled: false }, description: 'Dinner with the team', event_location_name: 'The meeting room', ...patch };
    linkedEvents.set(90, row); event.voting_config_json.linkedEventId = 90; return row;
  }
  const response = () => ({ id: 10, user_id: 2, response_key: '1', response_body: '1', response_label: 'Tuesday', source: 'sms', received_at: '2026-11-09T18:00:00Z' });
  it('returns readable choice, channel, timestamp, agency, and deadline without revealing other staff replies', async () => {
    replies.set(2, response()); replies.set(5, { ...response(), id: 11, user_id: 5, response_body: 'Private staff comment', response_label: 'Private staff comment' });
    const res = await pollsForParticipant(); const poll = res.json.mock.calls[0][0][0];
    expect(poll).toMatchObject({ agencyId: 4, closesAt: event.ends_at, canVote: true, results: null, resultsVisibility: 'after_close',
      myResponse: { label: 'Tuesday', original: '1', key: '1', source: 'sms', receivedAt: '2026-11-09T18:00:00Z' } });
    expect(JSON.stringify(poll)).not.toContain('Private staff comment');
  });
  it.each([
    { shareResults: true, resultsVisibility: 'live', closed: false, visible: true },
    { shareResults: true, resultsVisibility: 'after_close', closed: false, visible: false },
    { shareResults: true, resultsVisibility: 'after_close', closed: true, visible: true },
    { shareResults: false, resultsVisibility: 'live', closed: true, visible: false }
  ])('enforces organizer sharing choice: %j', async ({ shareResults, resultsVisibility, closed, visible }) => {
    Object.assign(event.voting_config_json, { shareResults, resultsVisibility });
    if (closed) event.voting_closed_at = '2026-11-09T18:00:00Z';
    replies.set(2, response());
    const res = await pollsForParticipant(); const poll = res.json.mock.calls[0][0][0];
    expect(poll.results).toEqual(visible ? [{ key: '1', label: 'Tuesday', total: 1 }, { key: '2', label: 'Friday', total: 0 }] : null);
  });
  it('treats an expired deadline as closed and releases shared final totals without offering another vote', async () => {
    event.ends_at = '2026-01-02T12:00:00Z'; replies.set(2, response());
    const res = await pollsForParticipant(); expect(res.json.mock.calls[0][0][0]).toMatchObject({ closedAt: event.ends_at, canVote: false, results: expect.any(Array) });
    const request = req(); request.body.resultsText = true;
    expect((await invoke('updateMyPollResultPreference', request)).status).toHaveBeenCalledWith(409);
  });
  it('returns an internal event link and allows its authenticated detail view for the event audience', async () => {
    linked(); const list = await pollsForParticipant();
    expect(list.json.mock.calls[0][0][0].linkedEvent).toMatchObject({ id: 90, title: 'Team dinner', available: true });
    const request = req(); request.params.eventId = '90'; const detail = await invoke('getMyStaffEvent', request);
    expect(detail.json).toHaveBeenCalledWith(expect.objectContaining({ id: 90, description: 'Dinner with the team' }));
    expect(detail.json.mock.calls[0][0]).not.toHaveProperty('audience');
    expect(detail.json.mock.calls[0][0]).not.toHaveProperty('smsCode');
  });
  it('links an existing event’s own RSVP poll to its internal event details automatically', async () => {
    event.event_type = 'company_event';
    const list = await pollsForParticipant();
    expect(list.json.mock.calls[0][0][0].linkedEvent).toMatchObject({ id: 20, title: event.title, available: true });
  });
  it('does not grant the internal event detail route to non-team accounts', async () => {
    linked(); users = [{ ...member, role: 'school_staff' }];
    const request = req(); request.params.eventId = '90';
    expect((await invoke('getMyStaffEvent', request)).status).toHaveBeenCalledWith(404);
  });
  it.each(['other_agency', 'inactive', 'private', 'canceled', 'removed'])('does not expose event details when the link is %s', async state => {
    linked(state === 'other_agency' ? { agency_id: 9 } : state === 'inactive' ? { is_active: 0 } : state === 'canceled' ? { school_event_status: 'canceled' } : {});
    if (state === 'private') linkedAudiences.set(90, [5]);
    if (state === 'removed') linkedEvents.delete(90);
    const list = await pollsForParticipant(); expect(list.json.mock.calls[0][0][0].linkedEvent).toEqual({ available: false });
    expect(JSON.stringify(list.json.mock.calls[0][0][0])).not.toContain('Team dinner');
    const request = req(); request.params.eventId = '90';
    expect((await invoke('getMyStaffEvent', request)).status).toHaveBeenCalledWith(404);
  });
  it('saves an optional event relationship and result timing, retaining both through older editors', async () => {
    linked(); event.voting_config_json.resultsVisibility = 'live';
    const body = { title: event.title, eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at, audience: { userIds: [2] },
      votingConfig: { enabled: true, deliveryMode: 'both', options: event.voting_config_json.options } };
    expect((await controller.persistCompanyEventUpdate(req(), 4, 20, body)).error).toBeUndefined();
    const [, values] = mock.execute.mock.calls.find(([sql]) => sql.includes('UPDATE company_events') && sql.includes('voting_config_json'));
    expect(values.some(value => typeof value === 'string' && value.includes('"linkedEventId":90') && value.includes('"resultsVisibility":"live"'))).toBe(true);
  });
  it.each(['self', 'other_agency', 'poll', 'removed', 'school', 'service'])('rejects a %s link on save', async state => {
    linked(state === 'other_agency' ? { agency_id: 9 } : state === 'poll' ? { event_type: 'team_poll' } : state === 'school' ? { event_type: 'school_outreach' } : state === 'service' ? { event_type: 'guardian_program_class' } : {});
    if (state === 'removed') linkedEvents.delete(90);
    const body = { title: event.title, eventType: 'team_poll', startsAt: event.starts_at, endsAt: event.ends_at, audience: { userIds: [2] },
      votingConfig: { ...event.voting_config_json, linkedEventId: state === 'self' ? 20 : 90 } };
    await expect(controller.persistCompanyEventUpdate(req(), 4, 20, body)).rejects.toMatchObject({ status: 400 });
    expect(mock.execute.mock.calls.some(([sql]) => sql.includes('UPDATE company_events'))).toBe(false);
  });
});

describe('organizer sharing and linking after a poll closes', () => {
  it('updates only presentation settings while preserving closure, votes, audience, deadline and delivery', async () => {
    event.voting_closed_at = '2026-11-09T18:00:00Z'; replies.set(2, { id: 10, user_id: 2, response_key: '1' });
    linkedEvents.set(90, { ...event, id: 90, event_type: 'company_event', voting_config_json: {}, title: 'Finalized dinner' });
    const request = req(); request.body = { shareResults: true, resultsVisibility: 'after_close', linkedEventId: 90, votingClosedAt: null, audience: { userIds: [] }, endsAt: '2099-12-31' };
    const res = await invoke('updateCompanyEventPollPresentation', request);
    expect(res.json.mock.calls[0][0].votingConfig).toMatchObject({ linkedEventId: 90, resultsVisibility: 'after_close' });
    const writes = mock.execute.mock.calls.filter(([sql]) => sql.trim().startsWith('UPDATE'));
    expect(writes).toHaveLength(1); expect(writes[0][0]).not.toMatch(/voting_closed_at|ends_at|company_event_responses|audience/);
    expect(writes[0][1].slice(-3)).toEqual([2, 20, 4]); expect(replies.size).toBe(1);
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.email).not.toHaveBeenCalled(); expect(mock.notification).not.toHaveBeenCalled();
  });
  it('requires organizer access before changing publication settings', async () => {
    const request = req(); request.user.role = 'provider'; request.body = { shareResults: true };
    const next = vi.fn(); await controller.updateCompanyEventPollPresentation(request, { status: vi.fn().mockReturnThis(), json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mock.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});

describe('dashboard poll owner controls', () => {
  it('shows an owner their poll without granting an uninvited owner a vote', async () => {
    event.created_by_user_id = 2; users = [{ ...member, id: 5 }];
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes('FROM users u JOIN user_agencies ua') ? Promise.resolve([[member, ...users]]) : original(sql, args));
    const res = await pollsForParticipant();
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ canManage: true, canVote: false });
  });
  it('lets the owner schedule a closing time without sending anything', async () => {
    event.created_by_user_id = 2;
    const request = req(); request.user.role = 'provider'; request.body = { closesAt: '2098-12-01T12:00:00Z' };
    const res = await invoke('scheduleMyStaffPollClosing', request);
    expect(res.json).toHaveBeenCalledWith({ closesAt: '2098-12-01T12:00:00.000Z' });
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [20, 4]);
    expect(mock.sms).not.toHaveBeenCalled(); expect(mock.email).not.toHaveBeenCalled();
  });
  it('lets the owner close immediately from the dashboard', async () => {
    event.created_by_user_id = 2;
    const request = req(); request.user.role = 'provider';
    const res = await invoke('closeMyStaffPoll', request);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, closedAt: expect.any(Date) }));
    expect(mock.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE company_events SET voting_closed_at'))).toBe(true);
  });
  it.each(['scheduleMyStaffPollClosing', 'closeMyStaffPoll'])('denies %s to another participant', async name => {
    event.created_by_user_id = 5;
    const request = req(); request.user.role = 'provider'; request.body = { closesAt: '2098-12-01T12:00:00Z' };
    const next = vi.fn(); await controller[name](request, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mock.getConnection).not.toHaveBeenCalled();
  });
  it('rejects a changed response after the configured deadline even before the closing worker runs', async () => {
    event.voting_config_json.closesAt = '2026-01-02T12:00:00Z'; replies.set(2, { id: 10, user_id: 2, response_key: '1' });
    const request = req(); request.body.responseKey = '2';
    const res = await invoke('respondToMyCompanyEvent', request);
    expect(res.status).toHaveBeenCalledWith(400); expect(replies.get(2).response_key).toBe('1');
    const list = await pollsForParticipant(); expect(list.json.mock.calls[0][0][0]).toMatchObject({ canVote: false, closedAt: new Date(event.voting_config_json.closesAt).toISOString() });
  });
  it('lets a current participant edit their text vote in the app, even when the invitation was SMS-only', async () => {
    event.voting_config_json.deliveryMode = 'sms'; replies.set(2, { id: 10, user_id: 2, response_key: '1', response_label: 'Tuesday', response_body: '1', source: 'sms' });
    const list = await pollsForParticipant(); expect(list.json.mock.calls[0][0][0]).toMatchObject({ canVote: true });
    const request = req(); request.body.responseKey = '2'; await invoke('respondToMyCompanyEvent', request);
    expect(replies.size).toBe(1); expect(replies.get(2).response_key).toBe('2');
    expect(mock.sms).not.toHaveBeenCalled();
  });
  it('finalizes an explicitly scheduled poll even when response reminders are disabled', async () => {
    event.voting_config_json.closesAt = '2026-01-02T12:00:00Z'; event.reminder_config_json = { enabled: false };
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql, args) => sql.includes("ORDER BY JSON_UNQUOTE(JSON_EXTRACT(voting_config_json, '$.closesAt'))") ? Promise.resolve([[event]]) : original(sql, args));
    await controller.processScheduledStaffPollClosures();
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE company_events SET voting_closed_at = ?'), [new Date(event.voting_config_json.closesAt), 20, 4]);
  });
});

describe('poll follow-ups and view receipts', () => {
  function priorInvitationFixture() {
    const original = mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql,args) => sql.includes('SELECT user_id, MIN(sent_at)') ? Promise.resolve([[{ user_id: 2, sent_at: '2026-01-01T00:00:00Z' }]]) : original(sql,args));
  }
  it('previews only previously invited nonresponders, without sending or logging a view', async () => {
    users = [member,{...member,id:6},{...member,id:7}]; replies.set(6,{user_id:6}); priorInvitationFixture();
    const request=req(); request.query.followup='1';
    const res=await invoke('previewCompanyEventPollDelivery',request);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({internalCount:1,smsEligibleCount:1,answeredCount:1,notInvitedCount:1}));
    expect(mock.sms).not.toHaveBeenCalled();expect(mock.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO company_event_poll_views'))).toBe(false);
  });
  it('sends a manual follow-up even without a schedule and audits it separately', async () => {
    users=[member]; priorInvitationFixture(); const request=req(); request.body.requestId='00000000-0000-4000-8000-000000000001';
    const res=await invoke('sendCompanyEventPollFollowup',request);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({sentCount:1,inAppCount:1}));
    expect(mock.sms).toHaveBeenCalledWith(expect.objectContaining({dispatchType:'poll_followup',batchId:'manual:'+request.body.requestId,body:expect.stringContaining('Reminder:')}));
    expect(mock.execute.mock.calls.some(([sql,args])=>sql.includes('INSERT INTO company_event_dispatch_logs')&&args[3]==='poll_followup'&&args[4]==='manual:'+request.body.requestId)).toBe(true);
  });
  it('does not repeat successful channels when a follow-up request is retried', async () => {
    users=[member]; priorInvitationFixture();const original=mock.execute.getMockImplementation();
    mock.execute.mockImplementation((sql,args)=>sql.includes("dispatch_type = 'poll_followup' AND occurrence_key")?Promise.resolve([[{user_id:2,channel:'sms'},{user_id:2,channel:'in_app'}]]):original(sql,args));
    const request=req();request.body.requestId='00000000-0000-4000-8000-000000000001';await invoke('sendCompanyEventPollFollowup',request);
    expect(mock.sms).not.toHaveBeenCalled();expect(mock.notification).not.toHaveBeenCalled();
  });
  it('skips a person who replied after the follow-up preview', async () => {
    users=[member];priorInvitationFixture();replies.set(2,{user_id:2});const request=req();request.body.requestId='00000000-0000-4000-8000-000000000001';await invoke('sendCompanyEventPollFollowup',request);
    expect(mock.sms).not.toHaveBeenCalled();expect(mock.notification).not.toHaveBeenCalled();
  });
  it('records a visible poll separately from listing it, including in-app follow-ups', async () => {
    await pollsForParticipant();expect(mock.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO company_event_poll_views'))).toBe(false);
    await invoke('recordMyStaffPollView');expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO company_event_poll_views'),[20,2,expect.any(Date),expect.any(Date)]);
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining("AND channel = 'in_app' AND status = 'sent'"),[expect.any(Date),20,2,expect.any(Date)]);
  });
  it('does not let an outside user mark a poll as viewed', async () => {
    users=[];const res=await invoke('recordMyStaffPollView');expect(res.status).toHaveBeenCalledWith(404);expect(mock.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO company_event_poll_views'))).toBe(false);
  });
  it('keeps real events on the calendar after an RSVP while excluding standalone polls', async () => {
    event.event_type='company_event';replies.set(2,{user_id:2,response_key:'yes'});const res=await invoke('listMyCompanyEvents');expect(res.json.mock.calls[0][0]).toHaveLength(1);
  });
});

it('automatically follows up at the deadline offset and suppresses already-sent reminder channels on the next run',async()=>{
 users=[member];event.voting_config_json.closesAt=new Date(Date.now()+23*3600000).toISOString();event.reminder_config_json={enabled:true,anchor:'poll_close',offsetsHours:[24,2],channels:{inApp:true,sms:true}};
 const sent=[];const original=mock.execute.getMockImplementation();
 mock.execute.mockImplementation((sql,args)=>{
  if(sql.includes('SELECT * FROM company_events WHERE is_active = 1'))return Promise.resolve([[event]]);
  if(sql.includes('SELECT user_id, MIN(sent_at)'))return Promise.resolve([[{user_id:2,sent_at:'2026-01-01T00:00:00Z'}]]);
  if(sql.includes("dispatch_type = 'poll_followup' AND occurrence_key"))return Promise.resolve([sent.map(channel=>({user_id:2,channel}))]);
  if(sql.includes('INSERT INTO company_event_dispatch_logs')&&args[3]==='poll_followup'&&args[5]==='sent')sent.push(args[2]);
  return original(sql,args);
 });
 await controller.processCompanyEventResponseReminders();expect(mock.sms).toHaveBeenCalledOnce();expect(mock.sms).toHaveBeenCalledWith(expect.objectContaining({dispatchType:'poll_followup',batchId:expect.stringMatching(/^scheduled:/)}));
 await controller.processCompanyEventResponseReminders();expect(mock.sms).toHaveBeenCalledOnce();expect(mock.notification).toHaveBeenCalledOnce();
});
