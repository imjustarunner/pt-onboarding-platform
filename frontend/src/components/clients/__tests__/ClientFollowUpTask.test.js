import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import FollowUp from '../ClientFollowUpTask.vue';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), counts: vi.fn(),
  auth: { user: { id: 17, first_name: 'Test', last_name: 'Staff', role: 'support' } },
  route: { params: { organizationSlug: 'itsco' }, query: {} }
}));
vi.mock('../../../services/api', () => ({ default: { post: mocks.post } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/tasks', () => ({ useTasksStore: () => ({ fetchTaskCounts: mocks.counts }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));

const client = { id: 42, initials: 'SC', full_name: 'Synthetic Client', agency_id: 10, identifier_code: 'SC-42', agency_name: 'Test Agency' };
const global = {
  stubs: {
    Teleport: true,
    RouterLink: { props: ['to'], template: '<a :href="to?.path"><slot /></a>' }
  }
};
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.auth.user = { id: 17, first_name: 'Test', last_name: 'Staff', role: 'support' };
  mocks.counts.mockResolvedValue({});
  mocks.post.mockResolvedValue({ data: { id: 81 } });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

async function open(record = client) {
  wrapper = mount(FollowUp, { attachTo: document.body, global });
  await wrapper.vm.open(record);
}

it('creates a regular task assigned to the signed-in user with note, due date, priority and structured client link', async () => {
  await open();
  expect(wrapper.text()).toContain('Assigned to you · Test Staff');
  expect(wrapper.text()).toContain('SC-42');
  expect(wrapper.get('a').attributes('href')).toBe('/itsco/admin/clients/42');
  expect(document.activeElement).toBe(wrapper.get('input[type="text"]').element);
  await wrapper.get('input[type="text"]').setValue('Call about intake');
  await wrapper.get('textarea').setValue('Confirm their preferred appointment day.');
  await wrapper.get('input[type="date"]').setValue('2026-12-03');
  await wrapper.get('select').setValue('high');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/me/tasks', {
    title: 'Call about intake', description: 'Confirm their preferred appointment day.', dueDate: '2026-12-03',
    assignedToUserId: 17, agencyId: 10, urgency: 'high', isPrivate: true, categories: ['client'],
    metadata: { source: 'client_follow_up', clientId: 42, agencyId: 10, organizationSlug: 'itsco' }
  });
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.get('[role="status"]').text()).toContain('Follow-up task created');
  expect(wrapper.emitted('created')[0]).toEqual([{ id: 81 }]);
  expect(mocks.counts).toHaveBeenCalledWith(10);
});

it('opens the menu from a row right-click and uses that row when creating the task', async () => {
  const Host = defineComponent({ components: { FollowUp }, setup: () => ({ followUp: ref(null), client }), template: '<table><tbody><tr @contextmenu="followUp.openContextMenu($event, client)"><td>Client row</td></tr></tbody></table><FollowUp ref="followUp" />' });
  wrapper = mount(Host, { attachTo: document.body, global });
  await wrapper.get('tr').trigger('contextmenu', { clientX: 10000, clientY: 10000 });
  const menu = wrapper.get('[role="menu"]');
  expect(parseInt(menu.element.style.left, 10)).toBeLessThan(window.innerWidth);
  expect(document.activeElement).toBe(wrapper.get('[role="menuitem"]').element);
  await wrapper.get('[role="menuitem"]').trigger('click');
  expect(wrapper.get('input[type="text"]').element.value).toBe('Follow up with SC');
  expect(wrapper.find('[role="menu"]').exists()).toBe(false);
});

it('keeps a failed draft available for retry and prevents duplicate submissions', async () => {
  let reject;
  mocks.post.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
  await open();
  await wrapper.get('textarea').setValue('Keep this note');
  await wrapper.get('form').trigger('submit');
  await wrapper.get('form').trigger('submit');
  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  reject({ response: { data: { error: { message: 'Please try again later' } } } });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toBe('Please try again later');
  expect(wrapper.get('textarea').element.value).toBe('Keep this note');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(mocks.post).toHaveBeenCalledTimes(2);
});

it('cancels without saving and clears the previous client draft when reopened', async () => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  await open();
  await wrapper.get('textarea').setValue('First client only');
  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
  expect(mocks.post).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  await wrapper.vm.open({ client_id: 99, client_initials: 'AB', agencyId: 20 });
  expect(wrapper.get('textarea').element.value).toBe('');
  expect(wrapper.get('input[type="text"]').element.value).toBe('Follow up with AB');
  expect(wrapper.get('a').attributes('href')).toBe('/itsco/admin/clients/99');
});

it('leaves native text editing menus available and refuses to save without a signed-in user', async () => {
  await open();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: wrapper.get('textarea').element });
  await wrapper.vm.openContextMenu(event, client);
  expect(event.defaultPrevented).toBe(false);
  mocks.auth.user = null;
  await wrapper.get('form').trigger('submit');
  expect(mocks.post).not.toHaveBeenCalled();
});
