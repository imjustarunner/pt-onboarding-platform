import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Card from '../SchoolContactWorkflowCard.vue';
import api from '../../../services/api';
import { useAgencyStore } from '../../../store/agency';
import { useUserPreferencesStore } from '../../../store/userPreferences';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper;
const workflow = { id: 12, clientId: 99, initials: 'AB', status: 'waiting_parent', initialSentAt: '2026-10-30T18:00:00Z', conversationId: 45 };
const options = { props: { agencyId: 450, clientId: 99 }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } } };
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); api.get.mockResolvedValue({ data: [{ ...workflow }, { ...workflow, id: 13, clientId: 100 }] }); api.post.mockResolvedValue({ data: { stopped: true } }); });
afterEach(() => wrapper?.unmount());
it('shows the client’s contact record and records an outside reply to stop follow-ups', async () => {
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.findAll('article')).toHaveLength(1);
  expect(wrapper.text()).toContain('Waiting for the family');
  expect(wrapper.find('a').text()).toContain('View email conversation');
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/workflows/12/parent-replied', {}, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(wrapper.text()).toContain('Outside reply recorded');
  expect(wrapper.find('button').exists()).toBe(false);
});
it('preserves the stop action when recording a reply fails', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  wrapper = mount(Card, options); await flushPromises();
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.find('[role="alert"]').text()).toContain('could not be recorded');
  expect(wrapper.find('button').exists()).toBe(true);
});
it('does not fetch automation for a production agency or offer stop after an in-app reply', async () => {
  wrapper = mount(Card, { ...options, props: { agencyId: 2, clientId: 99 } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled(); expect(wrapper.find('section').exists()).toBe(false);
  api.get.mockResolvedValue({ data: [{ ...workflow, parentReplyAt: '2026-10-30T19:00:00Z', status: 'awaiting_provider' }] });
  await wrapper.setProps({ agencyId: 450 }); await flushPromises();
  expect(wrapper.text()).toContain('Your response is needed'); expect(wrapper.find('button').exists()).toBe(false);
});

it('uses the user’s timezone and the selected tenant for its conversation link', async () => {
  const agencyStore = useAgencyStore(); agencyStore.currentAgency = { id: 450, portal_url: 'auricwell-qa-demo' };
  const preferences = useUserPreferencesStore(); preferences.timezone = 'America/Denver'; preferences.timeFormat = '24h';
  wrapper = mount(Card, options); await flushPromises();
  expect(wrapper.text()).toContain('12:00');
  expect(JSON.parse(wrapper.find('a').attributes('data-to'))).toEqual({ path: '/auricwell-qa-demo/messages', query: { conversationId: 45 } });
});
