import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from '../ClientPortalInviteDialog.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
const recipient = (key, clientId) => ({ key, snapshot:`snapshot-${key}`, name: 'Parent', email: 'parent@example.com', clients: [{ clientId, label: `C${clientId}` }] });
beforeEach(() => vi.resetAllMocks());
it('previews before sending, continues after a failure and prevents repeat sends', async () => {
  api.post.mockResolvedValueOnce({ data: { recipients: [recipient('2:10', 1), recipient('2:11', 2)], skipped: [{ clientId: 3, label: 'C3', reason: 'Add a contact' }] } })
    .mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ data: { status: 'sent' } });
  const w = mount(Dialog, { props: { clientIds: [1, 2, 3] } }); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1); expect(w.text()).toContain('C3: Add a contact');
  expect(w.findAll('input').every(i=>!i.element.checked)).toBe(true);
  for (const input of w.findAll('input')) await input.setValue(true);
  await w.findAll('button').find(b => b.text() === 'Send 2 invitations').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(3); expect(w.text()).toContain('1 invitations sent.'); expect(w.text()).toContain('Delivery could not be confirmed');
  expect(w.findAll('button').find(b => b.text() === 'Send 0 invitations').attributes('disabled')).toBeDefined(); w.unmount();
});
it('honors recipient exclusions', async () => {
  api.post.mockResolvedValueOnce({ data: { recipients: [recipient('2:10', 1), recipient('2:11', 2)], skipped: [] } }).mockResolvedValue({ data: {} });
  const w = mount(Dialog, { props: { clientIds: [1, 2] } }); await flushPromises();
  await w.findAll('input')[1].setValue(true); await w.findAll('button').find(b => b.text() === 'Send 1 invitations').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/clients/portal-invites/send', { clientIds: [2], recipientKey: '2:11', recipientSnapshot:'snapshot-2:11' }); w.unmount();
});

it('refreshes a stale pre-send preview without reopening successful or uncertain recipients',async()=>{
 const own={...recipient('2:own-enrollment:35',1),kind:'own_enrollment',invitationId:35,deliveryStatus:'failed',portalName:'Own enrollment'};
 const other=recipient('2:11',2);
 api.post.mockResolvedValueOnce({data:{recipients:[own,other],skipped:[]}})
  .mockRejectedValueOnce({response:{status:409,data:{error:{code:'PORTAL_INVITATION_PREVIEW_CHANGED'}}}})
  .mockResolvedValueOnce({data:{status:'sent'}})
  .mockResolvedValueOnce({data:{recipients:[{...own,snapshot:'fresh'},other],skipped:[]}});
 const w=mount(Dialog,{props:{clientIds:[1,2]}});await flushPromises();
 expect(w.text()).toContain('Retry existing own-enrollment invitation 35');
 for(const input of w.findAll('input'))await input.setValue(true);
 await w.findAll('button').find(b=>b.text()==='Send 2 invitations').trigger('click');await flushPromises();
 expect(w.text()).toContain('Not sent — the recipient or invitation changed');
 await w.findAll('button').find(b=>b.text()==='Refresh preview').trigger('click');await flushPromises();
 expect(w.findAll('input')[0].attributes('disabled')).toBeUndefined();
 expect(w.findAll('input')[1].attributes('disabled')).toBeDefined();
 expect(w.findAll('input').every(i=>!i.element.checked)).toBe(true);w.unmount();
});
it('records failed own-enrollment attempts accurately without claiming sent',async()=>{
 api.post.mockResolvedValueOnce({data:{recipients:[recipient('own',1)],skipped:[]}}).mockResolvedValueOnce({data:{status:'failed',invitationId:35,deliveryAttemptId:27}});
 const w=mount(Dialog,{props:{clientIds:[1]}});await flushPromises();await w.find('input').setValue(true);
 await w.findAll('button').find(b=>b.text()==='Send 1 invitations').trigger('click');await flushPromises();
 expect(w.text()).toContain('Not sent — a failed delivery was recorded');expect(w.text()).toContain('Invitation 35, delivery attempt 27');expect(w.text()).not.toContain('1 invitations sent.');w.unmount();
});
