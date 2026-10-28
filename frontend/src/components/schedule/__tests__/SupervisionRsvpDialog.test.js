import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
import Dialog from '../SupervisionRsvpDialog.vue';
let wrapper;
const current = { status: 'SIGNED_UP', reason: '', required: false, canRespond: true, canAccept: true };
beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ data: { ok: true } }); });
afterEach(() => wrapper?.unmount());
async function open(data = current) {
 api.get.mockResolvedValue({ data });
 wrapper = mount(Dialog, { props: { session: { id: 10, startAt: '2099-10-05T18:00:00Z', counterpartyName: 'Group with Alex' } } });
 await flushPromises();
}
it('shows the saved RSVP first and allows changing attending to declined and back', async () => {
 await open();
 expect(api.get).toHaveBeenCalledWith('/supervision/sessions/10/rsvp');
 expect(wrapper.text()).toContain('Current RSVP: Attending');
 expect(wrapper.find('input[value="accepted"]').element.checked).toBe(true);
 await wrapper.find('input[value="declined"]').setValue();
 await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/supervision/sessions/10/rsvp', { response: 'declined', reason: '' });
 expect(wrapper.text()).toContain('Current RSVP: Not attending');expect(wrapper.emitted('saved')).toHaveLength(1);
 await wrapper.find('input[value="accepted"]').setValue();
 await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/supervision/sessions/10/rsvp', { response: 'accepted', reason: '' });
 expect(wrapper.text()).toContain('Current RSVP: Attending');
});
it('loads a previous decline and requires a reason for a required attendee', async () => {
 await open({ ...current, required: true, status: 'DECLINED', reason: 'Class conflict' });
 expect(wrapper.find('textarea').element.value).toBe('Class conflict');
 await wrapper.find('textarea').setValue('  ');await wrapper.find('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();
 await wrapper.find('textarea').setValue('  Client appointment  ');await wrapper.find('form').trigger('submit'); await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/supervision/sessions/10/rsvp', { response: 'declined', reason: 'Client appointment' });
});
it('preserves the saved response and the proposed edit when saving fails', async () => {
 await open();api.post.mockRejectedValue({ response: { data: { error: { message: 'Please try again later' } } } });
 await wrapper.find('input[value="declined"]').setValue();await wrapper.find('form').trigger('submit');await flushPromises();
 expect(wrapper.text()).toContain('Current RSVP: Attending');expect(wrapper.find('input[value="declined"]').element.checked).toBe(true);
 expect(wrapper.find('[role="alert"]').text()).toBe('Please try again later');expect(wrapper.emitted('saved')).toBeUndefined();
});
it('respects closed registration and makes past sessions read-only', async () => {
 await open({ ...current, status: 'DECLINED', canAccept: false });expect(wrapper.find('input[value="accepted"]').element.disabled).toBe(true);
 wrapper.unmount();await open({ ...current, canRespond: false, canAccept: false });expect(wrapper.find('form').exists()).toBe(false);
});
it('opens details without changing the RSVP', async () => {
 await open();await wrapper.find('footer button').trigger('click');expect(wrapper.emitted('details')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();
});
it('lets a declined attendee explicitly update their RSVP and then join as themselves',async()=>{
 await open({...current,status:'DECLINED',required:false});
 await wrapper.setProps({session:{...wrapper.props('session'),joinUrl:'https://tenant.example/join/invitation/someone-elses-link'}});
 expect(api.post).not.toHaveBeenCalled();
 await wrapper.findAll('button').find(b=>b.text()==='Update RSVP and join').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/supervision/sessions/10/rsvp',{response:'accepted',reason:''});
 expect(wrapper.emitted('join')).toEqual([[`${window.location.origin}/join/supervision/10?account=1`]]);
 expect(wrapper.get('a').attributes('href')).toBe(`${window.location.origin}/join/supervision/10?account=1`);
});
it('does not navigate into a session if saving the RSVP fails',async()=>{
 await open({...current,status:'DECLINED'});
 await wrapper.setProps({session:{...wrapper.props('session'),joinUrl:'/join/supervision/10'}});
 api.post.mockRejectedValue({response:{data:{error:{message:'This meeting has ended.'}}}});
 await wrapper.findAll('button').find(b=>b.text()==='Update RSVP and join').trigger('click');await flushPromises();
 expect(wrapper.emitted('join')).toBeUndefined();expect(wrapper.text()).toContain('Current RSVP: Not attending');
});
it('does not offer joining when signup is closed or the session is in person',async()=>{
 await open({...current,status:'DECLINED',canAccept:false});
 await wrapper.setProps({session:{...wrapper.props('session'),joinUrl:'/join/supervision/10'}});
 expect(wrapper.text()).not.toContain('Update RSVP and join');
 wrapper.unmount();await open({...current,status:'DECLINED'});
 expect(wrapper.text()).not.toContain('Update RSVP and join');
});
