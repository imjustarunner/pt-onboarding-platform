import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from '../UnlinkedNoteCleanupDialog.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const items = [
  { kind: 'draft', id: 1, version: 'a'.repeat(64), clientId: 90, initials: 'T. E.', dateOfService: '2026-09-12', serviceCode: '90837', workQueueCount: 1 },
  { kind: 'work_queue', id: 22, version: 'b'.repeat(64), clientId: 90, dateOfService: '2026-09-13', serviceCode: '90837', workQueueCount: 1 }
];
let wrapper, afterDelete;
const button = text => wrapper.findAll('button').find(item => item.text().includes(text));
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { items, total: 2 } });
  api.post.mockResolvedValue({ data: { deletedDraftIds: [1], deletedWorkQueueIds: [21], deletedWorkQueueKeys: ['test_21'], clientIds: [90] } });
  afterDelete = vi.fn();
});
afterEach(() => wrapper?.unmount());
async function open() {
  wrapper = mount(Dialog, { props: { afterDelete }, global: { stubs: { Teleport: true } } });
  await flushPromises();
}
it('previews without deleting, defaults to no selection, and requires the exact confirmation', async () => {
  await open();
  expect(api.get).toHaveBeenCalledWith('/clinical-notes/drafts/unlinked-cleanup', { skipGlobalLoading: true });
  expect(api.post).not.toHaveBeenCalled();
  expect(button('Delete selected').element.disabled).toBe(true);
  await wrapper.find('li input[type=checkbox]').setValue(true);
  await wrapper.find('.unlinked-cleanup__confirmation input').setValue('delete unlinked');
  expect(button('Delete selected').element.disabled).toBe(true);
  await wrapper.find('.unlinked-cleanup__confirmation input').setValue('DELETE UNLINKED');
  expect(button('Delete selected').element.disabled).toBe(false);
});
it('deletes only reviewed selections, refreshes the workspace, and clears the selection to prevent a second deletion', async () => {
  await open();
  await wrapper.find('li input[type=checkbox]').setValue(true);
  await wrapper.find('.unlinked-cleanup__confirmation input').setValue('DELETE UNLINKED');
  await button('Delete selected').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clinical-notes/drafts/unlinked-cleanup', {
    confirmation: 'DELETE UNLINKED', items: [{ kind: 'draft', id: 1, version: 'a'.repeat(64) }]
  }, { skipGlobalLoading: true });
  expect(afterDelete).toHaveBeenCalledWith(expect.objectContaining({ deletedDraftIds: [1], deletedWorkQueueIds: [21] }));
  expect(wrapper.text()).toContain('Deleted 1 drafts and 1 My Work entries.');
  expect(button('Delete selected').element.disabled).toBe(true);
  await button('Refresh preview').trigger('click');
  await flushPromises();
  expect(wrapper.find('li input').element.checked).toBe(false);
  expect(wrapper.find('.unlinked-cleanup__confirmation input').element.value).toBe('');
});
it('lets the user select all shown but still requires confirmation', async () => {
  await open();
  await wrapper.find('input[type=checkbox]').setValue(true);
  expect(button('Delete selected').text()).toContain('(2)');
  expect(button('Delete selected').element.disabled).toBe(true);
});
it('shows a server conflict and requires a fresh selection without refreshing the workspace', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'An item is now linked. Refresh the preview.' } } } });
  await open();
  await wrapper.find('li input').setValue(true);
  await wrapper.find('.unlinked-cleanup__confirmation input').setValue('DELETE UNLINKED');
  await button('Delete selected').trigger('click');
  await flushPromises();
  expect(wrapper.find('[role=alert]').text()).toContain('now linked');
  expect(afterDelete).not.toHaveBeenCalled();
  expect(button('Delete selected').element.disabled).toBe(true);
});
it('reports deletion success separately if refreshing the workspace fails', async () => {
  afterDelete.mockRejectedValueOnce(new Error('Offline'));
  await open();
  await wrapper.find('li input').setValue(true);
  await wrapper.find('.unlinked-cleanup__confirmation input').setValue('DELETE UNLINKED');
  await button('Delete selected').trigger('click');
  await flushPromises();
  expect(wrapper.find('[role=alert]').text()).toContain('Deletion succeeded');
  expect(api.post).toHaveBeenCalledOnce();
});
it('keeps delete disabled when preview access is denied', async () => {
  api.get.mockRejectedValueOnce({ response: { data: { error: { message: 'Super admin access required.' } } } });
  await open();
  expect(wrapper.find('[role=alert]').text()).toContain('Super admin');
  expect(button('Delete selected').element.disabled).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});
