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
it('leaves a read-only preview when the organizer cancels confirmation', async () => {
  pollData({ canSend: true, internalCount: 2, smsEligibleCount: 0, smsSkippedCount: 2 });
  window.confirm.mockReturnValue(false);
  const w = mount(Team, { props: { agencyId: 4 } }); await flushPromises();
  await w.findAll('button').find(button => button.text() === 'Send poll').trigger('click'); await flushPromises();
  expect(w.get('[aria-label="Poll delivery preview"]').text()).toContain('0 eligible texts');
  expect(api.post).not.toHaveBeenCalled(); w.unmount();
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
