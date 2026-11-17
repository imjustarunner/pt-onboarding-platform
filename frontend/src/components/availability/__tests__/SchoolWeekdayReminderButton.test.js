import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Button from '../SchoolWeekdayReminderButton.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
let wrapper;
const progress={status:'pending',invitationStatus:'sent',reminderEnabled:true};
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('crypto',{randomUUID:vi.fn(()=>'test-email-request-00001')});api.post.mockResolvedValue({data:{reminder:{id:1,status:'pending',canSendAgain:false}}});});
afterEach(()=>{wrapper?.unmount();vi.unstubAllGlobals();});
function render(value=progress){wrapper=mount(Button,{props:{agencyId:2,providerId:7,providerName:'Synthetic Provider',progress:structuredClone(value)}});return wrapper;}
async function confirm(){await wrapper.find('button').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='Confirm email').trigger('click');await flushPromises();}
it('sends only after explicit confirmation and labels the resulting email queued until transport is recorded',async()=>{
 render();expect(api.post).not.toHaveBeenCalled();await confirm();
 expect(api.post).toHaveBeenCalledWith('/availability/admin/school-weekdays/7/email-reminder',{agencyId:2,requestKey:'test-email-request-00001',mode:'reminder'},expect.anything());
 expect(wrapper.text()).toContain('Email queued');expect(wrapper.text()).not.toContain('Reminder email sent');expect(wrapper.find('button').attributes('disabled')).toBeDefined();
 await wrapper.setProps({progress:{...progress,reminder:{id:1,status:'sent',sentAt:'2026-11-17T02:30:00Z',nextAllowedAt:'2026-11-18T02:30:00Z',canSendAgain:false}}});
 expect(wrapper.text()).toContain('Reminder email sent Nov 16');expect(wrapper.text()).toContain('Mountain');expect(api.post).toHaveBeenCalledTimes(1);
});
it('offers re-confirmation for saved disputed answers without requiring a historical invitation',async()=>{
 render({...progress,status:'completed',invitationStatus:'not_sent'});expect(wrapper.find('button').text()).toBe('Request re-confirmation');await confirm();expect(api.post.mock.calls[0][1].mode).toBe('reconfirm');
});
it('does not send when the manager cancels and keeps retries idempotent after a network failure',async()=>{
 render();await wrapper.find('button').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='Cancel').trigger('click');expect(api.post).not.toHaveBeenCalled();
 api.post.mockRejectedValueOnce(new Error('timeout'));await confirm();expect(wrapper.find('[role=alert]').text()).toContain('Could not confirm');
 await wrapper.findAll('button').find(b=>b.text()==='Confirm email').trigger('click');await flushPromises();expect(api.post.mock.calls[0][1].requestKey).toBe(api.post.mock.calls[1][1].requestKey);
});
it('disables incomplete forms whose initial invitation is still queued and ignores a stale cross-agency response',async()=>{
 render({...progress,invitationStatus:'pending'});expect(wrapper.find('button').attributes('disabled')).toBeDefined();
 await wrapper.setProps({progress});let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await wrapper.find('button').trigger('click');await wrapper.findAll('button').find(b=>b.text()==='Confirm email').trigger('click');
 await wrapper.setProps({agencyId:6});finish({data:{reminder:{id:99,status:'sent'}}});await flushPromises();expect(wrapper.emitted('queued')).toBeUndefined();expect(wrapper.text()).not.toContain('Reminder email sent');
});
