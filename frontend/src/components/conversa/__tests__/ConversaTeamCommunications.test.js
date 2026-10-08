import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
const auth = reactive({ user: { role: 'admin' } });
vi.mock('../../../store/auth', () => ({ useAuthStore: () => auth }));
import api from '../../../services/api';
import Team from '../ConversaTeamCommunications.vue';
const users = [{ id: 2, name: 'Taylor Team', role: 'staff' }, { id: 3, name: 'Guardian', role: 'client_guardian' }];
beforeEach(() => {
  vi.clearAllMocks(); auth.user.role = 'admin';
  api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/audience-options') ? { users } : [] }));
  api.post.mockResolvedValue({ data: { id: 22 } });
  api.put.mockResolvedValue({ data: { id: 22 } });
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
