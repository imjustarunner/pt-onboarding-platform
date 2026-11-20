import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TicketAssignmentControl from '../../tickets/TicketAssignmentControl.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const users = [
  { id: 7, first_name: 'Alex', last_name: 'Staff' },
  { id: 8, first_name: 'Taylor', last_name: 'Support' }
];
let wrapper;
let confirm;

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: { users } });
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  wrapper = mount(TicketAssignmentControl, {
    props: { ticketId: 14, agencyId: 2, ownerId: 6, ownerName: 'Morgan Support', viewerId: 7 }
  });
});

afterEach(() => {
  wrapper.unmount();
  confirm.mockRestore();
});

async function openOptions() {
  await wrapper.get('button').trigger('click');
  await flushPromises();
}

it('loads ticket-scoped options and confirms a transfer before changing the owner', async () => {
  api.post.mockResolvedValue({ data: { id: 14, claimed_by_user_id: 8 } });
  await openOptions();
  expect(api.get).toHaveBeenCalledWith('/support-tickets/assignees', expect.objectContaining({
    params: { agencyId: 2, ticketId: 14 }
  }));
  await wrapper.get('select').setValue('8');
  const assign = wrapper.findAll('button').find(button => button.text() === 'Confirm assignment');
  confirm.mockReturnValueOnce(false);
  await assign.trigger('click');
  expect(api.post).not.toHaveBeenCalled();
  await assign.trigger('click');
  await flushPromises();
  expect(confirm).toHaveBeenLastCalledWith('Reassign ticket #14 from Morgan Support to Taylor Support?');
  expect(api.post).toHaveBeenCalledWith('/support-tickets/14/assign', {
    assigneeUserId: 8, expectedAssigneeUserId: 6
  }, expect.any(Object));
  expect(wrapper.emitted('updated')).toEqual([[{ id: 14, claimed_by_user_id: 8 }]]);
});

it('offers an eligible viewer a takeover and refreshes on a competing assignment', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Ticket ownership changed.' } } } });
  await openOptions();
  await wrapper.findAll('button').find(button => button.text() === 'Take over').trigger('click');
  await flushPromises();
  expect(confirm).toHaveBeenLastCalledWith('Reassign ticket #14 from Morgan Support to yourself?');
  expect(wrapper.get('[role="alert"]').text()).toBe('Ticket ownership changed.');
  expect(wrapper.emitted('updated')).toBeUndefined();
  expect(wrapper.emitted('refresh')).toHaveLength(1);
});
