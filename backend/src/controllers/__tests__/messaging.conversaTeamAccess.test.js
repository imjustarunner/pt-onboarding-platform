import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), access: vi.fn(), user: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, query: mocks.execute } }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: mocks.access }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.user } }));
import * as controller from '../companyEvents.controller.js';
import { assertConversaTeamManager, isConversaTeamCommunication } from '../../services/conversaTeamAccess.service.js';
const deniedRoles = ['staff', 'provider', 'provider_plus', 'clinical_practice_assistant', 'schedule_manager', 'supervisor', 'client', 'client_guardian', 'club_manager'];
const strictHandlers = ['closeCompanyEventVoting', 'sendCompanyEventVotingSms', 'sendCompanyEventDirectMessage', 'saveCompanyEventSmsDraft', 'createCompanyEventTemplate', 'updateCompanyEventTemplate', 'deleteCompanyEventTemplate', 'classifyCompanyEventResponse'];
const payload = { title: 'Team poll', startsAt: '2026-10-09T12:00:00Z', endsAt: '2026-10-10T12:00:00Z', votingConfig: { enabled: true, options: [{ key: '1', label: 'Yes' }, { key: '2', label: 'No' }] } };
function req(role = 'staff', body = {}) { return { user: { id: 7, role }, params: { id: '4', eventId: '20', templateId: '2' }, body, query: {} }; }
async function invoke(name, request) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }, next = vi.fn();
  await controller[name](request, res, next);
  return { res, next };
}
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(true); mocks.execute.mockResolvedValue([[]]); });
describe('Conversa team administration boundaries', () => {
  it.each(deniedRoles)('denies every text/poll management operation for %s before writes or sends', async role => {
    for (const name of strictHandlers) {
      const { next } = await invoke(name, req(role));
      expect(next, name).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(['super_admin', 'admin', 'support'])('allows %s through the role gate while still validating requests', async role => {
    const { res, next } = await invoke('sendCompanyEventVotingSms', req(role));
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
  it.each(['admin', 'support'])('retains agency access checks for %s', async role => {
    mocks.access.mockResolvedValue(false);
    const { res } = await invoke('sendCompanyEventDirectMessage', req(role));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('blocks a staff member creating a poll through the ordinary event endpoint', async () => {
    const { next } = await invoke('createCompanyEvent', req('staff', payload));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('blocks changing an existing poll into an ordinary event to bypass permissions', async () => {
    mocks.execute.mockResolvedValueOnce([[{ id: 20, agency_id: 4, voting_config_json: JSON.stringify(payload.votingConfig) }]]);
    await expect(controller.persistCompanyEventUpdate(req(), 4, 20, { ...payload, votingConfig: { enabled: false } })).rejects.toMatchObject({ status: 403 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('blocks adding a poll or scheduled text to an ordinary event', async () => {
    for (const body of [payload, { ...payload, votingConfig: {}, smsDraft: { message: 'Team text' } }]) {
      mocks.execute.mockResolvedValueOnce([[{ id: 20, event_type: 'company_event' }]]);
      await expect(controller.persistCompanyEventUpdate(req(), 4, 20, body)).rejects.toMatchObject({ status: 403 });
    }
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
  it.each(['listCompanyEventResponses', 'listCompanyEventDeliveryLogs', 'getCompanyEventAnalytics', 'exportCompanyEventResponsesCsv', 'deleteCompanyEvent', 'sendCompanyEventInvitations', 'sendCompanyEventReminders'])('protects existing polls through %s', async name => {
    mocks.execute.mockResolvedValueOnce([[{ id: 20, event_type: 'team_poll' }]]);
    const { next } = await invoke(name, req());
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('protects the dedicated team list even for staff with event access', async () => {
    const request = req(); request.query.communicationsOnly = '1';
    const { next } = await invoke('listCompanyEventsForAgency', request);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('keeps ordinary event scheduling outside the team communication restriction', () => {
    expect(() => assertConversaTeamManager({ role: 'staff' }, { eventType: 'staff_event', votingConfig: { enabled: false } })).not.toThrow();
  });
  it.each([{ event_type: 'direct_notice' }, { voting_config_json: '{"enabled":true}' }, { reminderConfig: { channels: { sms: true } } }, { sms_draft_json: '{"message":"Hello"}' }])('recognizes all stored and incoming team communication forms', event => {
    expect(isConversaTeamCommunication(event)).toBe(true);
  });
});
