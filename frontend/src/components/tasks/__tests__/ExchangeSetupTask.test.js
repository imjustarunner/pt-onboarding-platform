import { expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), put: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock('../../../store/activeTaskDock', () => ({ useActiveTaskDockStore: () => ({ pinTask: vi.fn() }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
import Panel from '../TaskDetailSidePanel.vue';
it('opens the three-record importer after a support claim and allows marking the task done afterward', async () => {
  const item = { id: 4, task_type: 'custom', task_list_id: 2, title: 'Complete client record', status: 'pending', metadata: { source: 'client_exchange_setup', clientId: 15, agencyId: 2 } };
  const wrapper = shallowMount(Panel, { props: { item, agencyId: 2 }, global: { stubs: { RouterLink: true } } }); await flushPromises();
  expect(wrapper.text()).toContain('Import demographics, intake and treatment plan');
  wrapper.findComponent({ name: 'TaskClaimButton' }).vm.$emit('claimed', { ...item, assigned_to_user_id: 8 }); await flushPromises();
  const importer = wrapper.findComponent({ name: 'ClientEhrBringUpToDatePanel' });
  expect(importer.props()).toMatchObject({ open: true, clientId: 15, agencyId: 2, creationFlow: true });
  importer.vm.$emit('imported', { demographics: 'imported', intake: 'imported', plan: 'imported' }); await flushPromises();
  expect(wrapper.text()).toContain('Records saved');
  await wrapper.findAll('button').find(button => button.text() === 'Mark task done').trigger('click');
  expect(wrapper.emitted('complete')[0][0].id).toBe(4); wrapper.unmount();
});
