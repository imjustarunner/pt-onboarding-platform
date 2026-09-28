import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Details from '../BriefingItemDetails.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const render = (key, raw) => mount(Details, { props: { section: { key, title: key }, item: { id: raw.id, label: 'Details', raw } } });

describe('briefing details', () => {
  it('loads meeting participants, goals and actions without navigating or mutating data', async () => {
    api.get.mockResolvedValue({ data: { participants: [{ userId: 3, name: 'Alex', isHost: true }], workspace: { focusTitle: 'Planning', goals: [{ id: 'g', text: 'Review plan' }], actionItems: [{ id: 'a', text: 'Follow up', done: true }] } } });
    const w = render('meetings', { id: 8, kind: 'TEAM_MEETING', description: 'Meeting description', url: 'javascript:alert(1)' });
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/team-meetings/8/workspace', expect.objectContaining({ skipGlobalLoading: true }));
    expect(w.text()).toContain('Alex (Host)');
    expect(w.text()).toContain('Review plan');
    expect(w.text()).toContain('Follow up (Completed)');
    expect(w.find('.detail-join').exists()).toBe(false);
    w.unmount();
  });
  it('shows a ticket thread and a task description', async () => {
    api.get.mockResolvedValueOnce({ data: { ticket: { description: 'Ticket body' }, messages: [{ id: 2, body: 'Latest reply', author_first_name: 'Alex' }] } });
    const w = render('tickets', { id: 1 });
    await flushPromises();
    expect(w.text()).toContain('Latest reply');
    expect(w.text()).toContain('Ticket body');
    api.get.mockResolvedValueOnce({ data: { description: 'Task body', status: 'pending' } });
    await w.setProps({ section: { key: 'tasks', title: 'Tasks' }, item: { id: 2, label: 'Task', raw: { id: 2 } } });
    await flushPromises();
    expect(w.text()).toContain('Task body');
    expect(w.text()).not.toContain('Latest reply');
    w.unmount();
  });
  it('uses the authorized notification payload without calling the superadmin-only audit endpoint', async () => {
    const w = render('notifications', { id: 1, message: 'Notification details' });
    await flushPromises();
    expect(w.text()).toContain('Notification details');
    expect(api.get).not.toHaveBeenCalled();
    w.unmount();
  });
  it('allows retry after a failure and ignores stale responses', async () => {
    let finish;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const w = render('tasks', { id: 1 });
    api.get.mockRejectedValueOnce(new Error('Unavailable'));
    await w.setProps({ item: { id: 2, label: 'New task', raw: { id: 2 } } });
    await flushPromises();
    finish({ data: { description: 'Stale task' } });
    await flushPromises();
    expect(w.text()).not.toContain('Stale task');
    expect(w.find('[role="alert"]').exists()).toBe(true);
    api.get.mockResolvedValueOnce({ data: { description: 'Current task' } });
    await w.get('.detail-error button').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Current task');
    w.unmount();
  });
});
