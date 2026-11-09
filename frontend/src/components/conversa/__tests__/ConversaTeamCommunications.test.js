import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
const auth = reactive({ user: { role: 'admin' } });
vi.mock('../../../store/auth', () => ({ useAuthStore: () => auth }));
import api from '../../../services/api';
import Team from '../ConversaTeamCommunications.vue';
const users = [{ id: 2, name: 'Taylor Team', role: 'staff', pollingSms: { eligible: true, label: 'Polling SMS opted in' } }, { id: 3, name: 'Guardian', role: 'client_guardian' }];
beforeEach(() => {
  vi.clearAllMocks(); auth.user.role = 'admin';
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users } : [] }));
  api.post.mockResolvedValue({ data: { id: 22 } });
  api.put.mockResolvedValue({ data: { id: 22 } });
});

const savedPoll = { id: 22, title: 'Team date', eventType: 'team_poll', votingConfig: { enabled: true, deliveryMode: 'both', viaSms: true } };
function pollData(preview) {
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users }
    : url.endsWith('/poll-delivery-preview') ? preview : [savedPoll] }));
}
it('preflights saved poll delivery before confirmation and clearly reports zero SMS sent', async () => {
  pollData({ canSend: true, internalCount: 2, smsEligibleCount: 1, smsSkippedCount: 1, answeredCount: 3,
    smsSender: { ready: true, label: 'Staff polling SMS sender ready', fromNumber: '+13035550100' },
    reasons: [{ code: 'sms_opted_out', label: 'SMS opted out', count: 1 }] });
  api.post.mockResolvedValue({ data: { inAppCount: 2, sentCount: 0, skippedCount: 2, skippedReasons: [{ label: 'SMS opted out', count: 2 }] } });
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(button => button.text() === 'Send poll').trigger('click'); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/agencies/4/company-events/22/poll-delivery-preview');
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 internal messages · 1 eligible texts · 1 SMS unavailable · 3 already answered'));
  expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events/22/send-poll', {});
  expect(w.get('[role=status]').text()).toContain('No text messages were sent.');
  expect(w.get('[role=status]').text()).toContain('2 sms opted out');
  expect(w.get('[aria-label="Poll delivery preview"]').text()).toContain('1 · SMS opted out');
  w.unmount();
});
it('shows a global sender setup issue without silently sending only internally', async () => {
  pollData({ canSend: false, internalCount: 2, smsEligibleCount: 0, smsSkippedCount: 2,
    smsSender: { ready: false, label: 'Configure an approved staff polling sender for this agency.' } });
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(button => button.text() === 'Send poll').trigger('click'); await flushPromises();
  expect(w.get('[role=alert]').text()).toContain('Configure an approved staff polling sender');
  expect(window.confirm).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
  w.unmount();
});
it('previews and reports email-only fallback delivery honestly', async () => {
  pollData({ canSend: true, internalCount: 0, smsEligibleCount: 0, smsSkippedCount: 1, emailCount: 1 });
  api.post.mockResolvedValue({ data: { inAppCount: 0, sentCount: 0, emailCount: 1, skippedCount: 1 } });
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Send poll').trigger('click'); await flushPromises();
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1 work email voting invitations'));
  expect(w.get('[role=status]').text()).toContain('0 SMS, 1 email');
  expect(w.get('[role=status]').text()).toContain('No text messages were sent');
  w.unmount();
});
it('allows SSO email fallback recipients to remain selected for SMS delivery', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users: [{ id: 5, name: 'Morgan SSO', role: 'provider',
    pollingSms: { eligible: false, label: 'SMS opted out' }, pollingEmail: { eligible: true, label: 'Work email voting invitation' } }] } : [] }));
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.get('select').setValue('poll'); await w.get('[aria-label="Poll delivery"]').setValue('both');
  await w.get('.team-recipients input').setValue(true);
  await w.get('[aria-label="Poll delivery"]').setValue('sms');
  expect(w.get('.team-recipients input').element.checked).toBe(true);
  expect(w.get('.team-recipients input').element.disabled).toBe(false);
  expect(w.text()).toContain('1 selected members will receive a work email');
  w.unmount();
});
it('leaves a read-only preview when the organizer cancels confirmation', async () => {
  pollData({ canSend: true, internalCount: 2, smsEligibleCount: 0, smsSkippedCount: 2 });
  window.confirm.mockReturnValue(false);
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(button => button.text() === 'Send poll').trigger('click'); await flushPromises();
  expect(w.get('[aria-label="Poll delivery preview"]').text()).toContain('0 eligible texts');
  expect(api.post).not.toHaveBeenCalled(); w.unmount();
});
it('reviews delivery after adding a poll recipient and sends only missing invitations', async () => {
  const event = { ...savedPoll, audience: { userIds: [] }, votingConfig: { ...savedPoll.votingConfig, question: 'Which day?' } };
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users }
    : url.endsWith('/poll-delivery-preview') ? { canSend: true, internalCount: 1, smsEligibleCount: 1, alreadyNotifiedCount: 3 } : [event] }));
  api.post.mockResolvedValue({ data: { inAppCount: 1, sentCount: 1 } });
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Edit').trigger('click');
  await w.get('.team-recipients input').setValue(true);
  expect(w.get('.team-primary').text()).toBe('Save & review delivery');
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/agencies/4/company-events/22', expect.objectContaining({ audience: expect.objectContaining({ userIds: [2] }) }));
  expect(api.get).toHaveBeenCalledWith('/agencies/4/company-events/22/poll-delivery-preview', { params: { unsentOnly: 1 } });
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3 already notified'));
  expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events/22/send-poll', { unsentOnly: true });
  expect(w.get('[role=status]').text()).toContain('1 internal, 1 SMS');
  w.unmount();
});
it.each(['save only', 'cancel delivery'])('clearly reports a saved but unsent poll when choosing %s', async choice => {
  pollData({ canSend: true, internalCount: 1, smsEligibleCount: 1 });
  window.confirm.mockReturnValue(false);
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Edit').trigger('click');
  await w.get('.team-recipients input').setValue(true);
  if (choice === 'save only') await w.findAll('button').find(b => b.text() === 'Save without sending').trigger('click');
  else await w.get('form').trigger('submit');
  await flushPromises();
  expect(api.put).toHaveBeenCalledOnce();
  expect(api.post).not.toHaveBeenCalled();
  expect(w.get('[role=status]').text()).toContain('This save has not sent notifications');
  expect(w.text()).toContain('including newly added team members');
  w.unmount();
});
it('keeps save failure separate from delivery and does not send an unsaved audience', async () => {
  pollData({ canSend: true, internalCount: 1 });
  api.put.mockRejectedValueOnce(new Error('Save failed'));
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(b => b.text() === 'Edit').trigger('click');
  await w.get('.team-recipients input').setValue(true);
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).not.toHaveBeenCalled();
  expect(api.get.mock.calls.some(([url]) => url.endsWith('/poll-delivery-preview'))).toBe(false);
  expect(w.get('[role=alert]').text()).toContain('Could not save');
  w.unmount();
});
describe('Conversa team communications', () => {
  it.each(['staff', 'provider', 'client_guardian', 'clinical_practice_assistant'])('does not load management data or expose controls for %s', async role => {
    auth.user.role = role;
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    expect(w.find('form').exists()).toBe(false);
    expect(w.get('[role=alert]').text()).toContain('Only superadmins');
    expect(api.get).not.toHaveBeenCalled(); w.unmount();
  });
  it.each(['super_admin', 'admin', 'support'])('lets %s select team recipients without including families', async role => {
    auth.user.role = role;
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    expect(w.find('form').exists()).toBe(true);
    expect(w.text()).toContain('Taylor Team'); expect(w.text()).not.toContain('Guardian');
    expect(api.get).toHaveBeenCalledWith('/agencies/4/company-events', { params: { communicationsOnly: 1 } });
    w.unmount();
  });
  it('saves a team message for explicit recipients without sending on save', async () => {
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    await w.get('input[placeholder="A clear title for your team"]').setValue('Team update');
    await w.get('textarea').setValue('Tomorrow at nine');
    await w.get('.team-recipients input').setValue(true);
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events', expect.objectContaining({ eventType: 'direct_notice', audience: { userIds: [2], groupIds: [], roleKeys: [] }, votingConfig: expect.objectContaining({ enabled: false }) }));
    expect(w.get('[role=status]').text()).toContain('saved'); w.unmount();
  });
  it('creates a poll in the existing event system and preserves SMS opt-in as a separate choice', async () => {
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    await w.get('select').setValue('poll');
    await w.get('input[placeholder="A clear title for your team"]').setValue('Team day');
    await w.get('input[maxlength="255"]').setValue('Which day?');
    await w.get('.team-recipients input').setValue(true);
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events', expect.objectContaining({ eventType: 'team_poll', votingConfig: expect.objectContaining({ enabled: true, viaSms: false, shareResults: true, question: 'Which day?' }) }));
    w.unmount();
  });
  it('edits the same stored team message without creating another communication', async () => {
    const event = { id: 22, eventType: 'direct_notice', title: 'Original', description: 'Message', startsAt: '2026-10-09T12:00:00Z', endsAt: '2026-11-09T12:00:00Z', audience: { userIds: [2], groupIds: [], roleKeys: [] } };
    api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users } : [event] }));
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click');
    await w.get('input[placeholder="A clear title for your team"]').setValue('Corrected');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/agencies/4/company-events/22', expect.objectContaining({ title: 'Corrected', startsAt: event.startsAt, endsAt: event.endsAt }));
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('clears audience and drafts when the agency changes', async () => {
    const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
    await w.get('textarea').setValue('Agency four'); await w.get('.team-recipients input').setValue(true);
    await w.setProps({ agencyId: 9 }); await flushPromises();
    expect(w.get('textarea').element.value).toBe('');
    expect(w.get('.team-recipients input').element.checked).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/agencies/9/company-events', { params: { communicationsOnly: 1 } }); w.unmount();
  });
});

it('shows opt-outs, blocks SMS-only selection, and allows internal delivery with Both', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users: [...users, { id: 5, name: 'Morgan Opt Out', role: 'staff', pollingSms: { eligible: false, label: 'SMS opted out' } }, { id: 6, name: 'School Account', role: 'school_staff' }] } : [] }));
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.get('select').setValue('poll');
  await w.get('[aria-label="Poll delivery"]').setValue('sms');
  expect(w.text()).not.toContain('School Account');
  expect(w.text()).toContain('Morgan Opt Out'); expect(w.text()).toContain('SMS opted out');
  expect(w.findAll('.team-recipients input')[1].element.disabled).toBe(true);
  await w.get('[aria-label="Poll delivery"]').setValue('both');
  expect(w.findAll('.team-recipients input')[1].element.disabled).toBe(false);
  await w.findAll('.team-recipients input')[1].setValue(true);
  await w.get('input[placeholder="A clear title for your team"]').setValue('Team day');
  await w.get('input[maxlength="255"]').setValue('Which day?');
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events', expect.objectContaining({ audience: expect.objectContaining({ userIds: [5] }), votingConfig: expect.objectContaining({ deliveryMode: 'both', viaSms: true }) }));
  w.unmount();
});
it('removes an opted-out selection when switching from Both to SMS only', async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users: [{ id: 5, name: 'Morgan', role: 'staff', pollingSms: { eligible: false, label: 'SMS opted out' } }] } : [] }));
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.get('select').setValue('poll'); await w.get('[aria-label="Poll delivery"]').setValue('both');
  await w.get('.team-recipients input').setValue(true);
  await w.get('[aria-label="Poll delivery"]').setValue('sms');
  expect(w.get('.team-recipients input').element.checked).toBe(false);
  expect(w.get('.team-primary').element.disabled).toBe(true); w.unmount();
});

it('lets organizers choose a deadline, live totals, and an optional internal event without sending the saved poll', async () => {
  api.get.mockImplementation((url, config) => Promise.resolve({ data: url.endsWith('/audience-options') ? { users }
    : config?.params?.pollLinkOptions ? [{ id: 90, title: 'Team dinner', isActive: true }] : [] }));
  api.post.mockResolvedValue({ data: { id: 22 } });
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.get('select').setValue('poll'); await flushPromises();
  await w.get('input[required]').setValue('Date for dinner');
  await w.get('input[maxlength="255"]').setValue('Which day?');
  await w.get('[aria-label="Voting deadline"]').setValue('2099-11-12T12:00');
  await w.get('[aria-label="Results visibility"]').setValue('live');
  await w.get('[aria-label="Linked internal event"]').setValue('90');
  await w.get('.team-recipients input').setValue(true);
  await w.findAll('button').find(b => b.text() === 'Save without sending').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events', expect.objectContaining({ endsAt: new Date('2099-11-12T12:00').toISOString(), votingConfig: expect.objectContaining({ linkedEventId: 90, resultsVisibility: 'live', shareResults: true }) }));
  expect(api.post.mock.calls.some(([url]) => url.endsWith('/send-poll'))).toBe(false);
  w.unmount();
});
it('allows a manual follow-up without enabling a schedule and previews only nonresponders',async()=>{
 pollData({canSend:true,internalCount:1,smsEligibleCount:1,answeredCount:2,notInvitedCount:1});
 const w=mount(Team,{props:{agencyId:4}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Send follow-up · no replies').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/agencies/4/company-events/22/poll-delivery-preview',{params:{followup:1,unsentOnly:undefined}});
 expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events/22/send-poll-followup',{requestId:expect.any(String)});expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('who have not replied'));w.unmount();
});
it('saves a closing-relative follow-up schedule without sending a message',async()=>{
 const w=mount(Team,{props:{agencyId:4}});await flushPromises();await w.find('.team-grid select').setValue('poll');
 const title=w.findAll('input').find(i=>i.attributes('maxlength')==='180');await title.setValue('Dinner date');
 await w.find('.team-recipients input').setValue(true);await w.findAll('label').find(l=>l.text().includes('Schedule follow-ups for invited')).get('input').setValue(true);await w.get('[aria-label="Follow-up hours"]').setValue('24,2');
 await w.findAll('button').find(b=>b.text()==='Save without sending').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/agencies/4/company-events',expect.objectContaining({reminderConfig:{enabled:true,anchor:'poll_close',offsetsHours:[24,2],channels:{inApp:true,sms:false}}}));
 expect(api.post.mock.calls.every(([url])=>!url.includes('send-'))).toBe(true);w.unmount();
});

it('opens an actual event’s existing setup instead of creating another linked event',async()=>{
 api.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/audience-options')?{users}:[{...savedPoll,eventType:'company_event'}]}));
 const w=mount(Team,{props:{agencyId:4},global:{stubs:{StaffEventForm:{props:['initialEventId'],template:'<div data-testid="event-setup">{{initialEventId}}</div>'}}}});await flushPromises();
 expect(w.findAll('button').some(b=>b.text()==='Create linked event')).toBe(false);await w.findAll('button').find(b=>b.text()==='Manage event').trigger('click');await flushPromises();expect(w.get('[data-testid="event-setup"]').text()).toBe('22');expect(api.put).not.toHaveBeenCalled();w.unmount();
});
