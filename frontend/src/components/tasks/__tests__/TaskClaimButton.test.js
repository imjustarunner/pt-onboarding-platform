import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
import Button from '../TaskClaimButton.vue';
const task = { id: 4, task_type: 'custom', task_list_id: 2, status: 'pending' };
beforeEach(() => vi.clearAllMocks());
it('claims shared tasks and reports the new owner', async () => {
  mocks.post.mockResolvedValue({ data: { ...task, assigned_to_user_id: 8 } });
  const wrapper = mount(Button, { props: { task } }); await wrapper.find('button').trigger('click'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/me/tasks/4/claim'); expect(wrapper.text()).toContain('Assigned to you'); expect(wrapper.emitted('claimed')[0][0].assigned_to_user_id).toBe(8);
});
it('does not claim assigned tasks and reports a competing claim without pretending success', async () => {
  const assigned = mount(Button, { props: { task: { ...task, assigned_to_user_id: 9 } } }); expect(assigned.find('button').exists()).toBe(false);
  mocks.post.mockRejectedValue({ response: { data: { error: { message: 'Another teammate already owns this task.' } } } });
  const wrapper = mount(Button, { props: { task } }); await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Another teammate'); expect(wrapper.emitted('claimed')).toBeUndefined();
});
