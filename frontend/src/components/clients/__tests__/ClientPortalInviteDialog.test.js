import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from '../ClientPortalInviteDialog.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
const recipient = (key, clientId) => ({ key, name: 'Parent', email: 'parent@example.com', clients: [{ clientId, label: `C${clientId}` }] });
beforeEach(() => vi.resetAllMocks());
it('previews before sending, continues after a failure and prevents repeat sends', async () => {
  api.post.mockResolvedValueOnce({ data: { recipients: [recipient('2:10', 1), recipient('2:11', 2)], skipped: [{ clientId: 3, label: 'C3', reason: 'Add a contact' }] } })
    .mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ data: { status: 'sent' } });
  const w = mount(Dialog, { props: { clientIds: [1, 2, 3] } }); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1); expect(w.text()).toContain('C3: Add a contact');
  await w.findAll('button').find(b => b.text() === 'Send 2 invitations').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(3); expect(w.text()).toContain('1 invitations sent.'); expect(w.text()).toContain('Delivery could not be confirmed');
  expect(w.findAll('button').find(b => b.text() === 'Send 0 invitations').attributes('disabled')).toBeDefined(); w.unmount();
});
it('honors recipient exclusions', async () => {
  api.post.mockResolvedValueOnce({ data: { recipients: [recipient('2:10', 1), recipient('2:11', 2)], skipped: [] } }).mockResolvedValue({ data: {} });
  const w = mount(Dialog, { props: { clientIds: [1, 2] } }); await flushPromises();
  await w.find('input').setValue(false); await w.findAll('button').find(b => b.text() === 'Send 1 invitations').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/clients/portal-invites/send', { clientIds: [2], recipientKey: '2:11' }); w.unmount();
});
