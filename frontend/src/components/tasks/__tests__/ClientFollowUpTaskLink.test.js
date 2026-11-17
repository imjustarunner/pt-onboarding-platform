import { expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), put: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock('../../../store/activeTaskDock', () => ({ useActiveTaskDockStore: () => ({ pinTask: vi.fn() }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'another-agency' } }) }));
import Panel from '../TaskDetailSidePanel.vue';

it('links a saved follow-up task to its client in the originating tenant and supports serialized metadata', async () => {
  const item = { id: 81, task_type: 'custom', title: 'Follow up with SC', status: 'pending', assigned_to_user_id: 17, metadata: JSON.stringify({ source: 'client_follow_up', clientId: 42, agencyId: 10, organizationSlug: 'itsco' }) };
  const wrapper = shallowMount(Panel, { props: { item, agencyId: 10 }, global: { stubs: { RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' } } } });
  await flushPromises();
  const link = wrapper.findAllComponents({ name: 'RouterLink' }).find(component => component.attributes('class')?.includes('btn-primary'));
  expect(link.props('to')).toEqual({ path: '/itsco/admin/clients/42', query: { agencyId: '10' } });
  await wrapper.setProps({ item: { ...item, id: 82, metadata: {} } });
  await flushPromises();
  expect(wrapper.text()).not.toContain('Follow up with this client using the note');
  wrapper.unmount();
});
