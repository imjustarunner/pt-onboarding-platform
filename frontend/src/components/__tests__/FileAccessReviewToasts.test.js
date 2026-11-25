import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: mocks }));
import Toasts from '../FileAccessReviewToasts.vue';
const ticket = { id: 'ticket-a', user_id: 3, actor_email: 'staff@example.invalid', reason: 'Review the existing file-access hold so routine work can continue.' };
let wrapper;
const mountToasts = (userId = 501) => wrapper = mount(Toasts, { props: { userId }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } } });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.get.mockResolvedValue({ data: { tickets: [ticket] } }); mocks.post.mockResolvedValue({ data: { reviewed: true } }); });
afterEach(() => wrapper?.unmount());
it('restores pending requests after remount until explicitly hidden or reviewed', async () => {
 mountToasts(); await flushPromises(); expect(wrapper.text()).toContain('staff@example.invalid');
 wrapper.unmount(); mountToasts(); await flushPromises(); expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Hide', 'Keep holding', 'Dismiss', 'Reviewed & reset']);
 expect(wrapper.text()).toContain('audit history is retained');
});
it.each([['Keep holding', 'keep_holding'], ['Dismiss', 'dismissed'], ['Reviewed & reset', 'reset']])('persists %s before removing the request', async (label, decision) => {
 let resolve; mocks.post.mockReturnValue(new Promise(r => { resolve = r; }));
 mountToasts(); await flushPromises(); await wrapper.findAll('button').find(b => b.text() === label).trigger('click');
 expect(wrapper.find('article').exists()).toBe(true);
 expect(mocks.post).toHaveBeenCalledWith('/privacy-review/tickets/ticket-a/review', { decision }, { headers: { 'X-Account-Security': '1' } });
 resolve({ data: { reviewed: true } }); await flushPromises(); expect(wrapper.find('article').exists()).toBe(false);
});
it('keeps the request when a review fails, including fresh verification requirements', async () => {
 mocks.post.mockRejectedValue({ response: { data: { error: { message: 'Enter a fresh authenticator code.' } } } });
 mountToasts(); await flushPromises(); await wrapper.findAll('button').find(b => b.text() === 'Reviewed & reset').trigger('click'); await flushPromises();
 expect(wrapper.find('article').exists()).toBe(true); expect(wrapper.find('[role="alert"]').text()).toContain('fresh authenticator');
});
it('links to the request owner’s activity and document audit', async () => {
 mountToasts(); await flushPromises();
 const links = wrapper.findAll('a').map(a => JSON.parse(a.attributes('data-to')));
 expect(links).toEqual([...['user_activity', 'phi_document'].map(source => ({ path: '/admin/audit-center', query: { userId: '3', source, view: 'table' } })), '/privacy-review']);
});
it('requires a different designated reviewer for the current user’s request', async () => {
 mountToasts(3); await flushPromises(); expect(wrapper.text()).toContain('Another designated reviewer'); expect(wrapper.findAll('button').map(b=>b.text())).toEqual(['Hide']);
});
it('offers audited owner recovery only when the server confirms sole-reviewer eligibility',async()=>{
 mocks.get.mockResolvedValue({data:{tickets:[{...ticket,hold_reason:'volume_limit'}],selfRecoveryAllowed:true}});
 mountToasts(3);await flushPromises();expect(wrapper.text()).toContain('Restore your file access');expect(wrapper.text()).toContain('file-access volume limit');
 expect(wrapper.findAll('button').some(button=>button.text()==='Reviewed & reset')).toBe(false);
 const form=wrapper.get('form');await form.get('textarea').setValue('I reviewed the logs and need to continue routine file work.');await form.get('input[type=checkbox]').setValue(true);
 await form.trigger('submit');await flushPromises();expect(wrapper.find('article').exists()).toBe(false);
});

it('does not restore a resolved request from an older in-flight queue read', async () => {
 mountToasts(); await flushPromises(); let resolve; mocks.get.mockReturnValueOnce(new Promise(r => { resolve = r; }));
 window.dispatchEvent(new Event('focus')); await flushPromises();
 await wrapper.findAll('button').find(b => b.text() === 'Dismiss').trigger('click'); await flushPromises();
 resolve({ data: { tickets: [ticket] } }); await flushPromises(); expect(wrapper.find('article').exists()).toBe(false);
});

it('hides a notice immediately without reviewing it, and keeps it hidden through polls and remounts in this tab',async()=>{
 mountToasts(3);await flushPromises();
 expect(wrapper.findAll('a').some(a=>a.text()==='Review queue')).toBe(true);
 await wrapper.get('button[aria-label="Hide file-access notification"]').trigger('click');
 expect(wrapper.find('article').exists()).toBe(false);expect(mocks.post).not.toHaveBeenCalled();
 expect(JSON.parse(sessionStorage.getItem('file-review-notices:hidden:v1:3'))).toEqual(['ticket-a']);
 window.dispatchEvent(new Event('focus'));await flushPromises();expect(wrapper.find('article').exists()).toBe(false);
 wrapper.unmount();mountToasts(3);await flushPromises();expect(wrapper.find('article').exists()).toBe(false);
 expect(mocks.post).not.toHaveBeenCalled();
});
it('shows a new request while keeping only the explicitly hidden request out of view',async()=>{
 mountToasts();await flushPromises();await wrapper.get('button[aria-label="Hide file-access notification"]').trigger('click');
 mocks.get.mockResolvedValue({data:{tickets:[ticket,{...ticket,id:'ticket-b',actor_email:'new-request@example.invalid'}]}});
 window.dispatchEvent(new Event('focus'));await flushPromises();expect(wrapper.findAll('article')).toHaveLength(1);expect(wrapper.text()).toContain('new-request@example.invalid');
 expect(mocks.post).not.toHaveBeenCalled();
});
it('isolates hidden notices by the signed-in reviewer and rejects an older account’s in-flight response',async()=>{
 mountToasts(501);await flushPromises();await wrapper.get('button[aria-label="Hide file-access notification"]').trigger('click');
 let resolve; mocks.get.mockReturnValueOnce(new Promise(r=>{resolve=r;}));window.dispatchEvent(new Event('focus'));await flushPromises();
 await wrapper.setProps({userId:502});expect(wrapper.find('article').exists()).toBe(false);
 resolve({data:{tickets:[{...ticket,actor_email:'old-account@example.invalid'}]}});await flushPromises();
 expect(wrapper.text()).not.toContain('old-account@example.invalid');expect(wrapper.text()).toContain('staff@example.invalid');
 expect(mocks.post).not.toHaveBeenCalled();
});
it('still hides the notice when session storage is unavailable',async()=>{
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Unavailable');});
 try{mountToasts();await flushPromises();await wrapper.get('button[aria-label="Hide file-access notification"]').trigger('click');expect(wrapper.find('article').exists()).toBe(false);expect(mocks.post).not.toHaveBeenCalled();}
 finally{storage.mockRestore();}
});
