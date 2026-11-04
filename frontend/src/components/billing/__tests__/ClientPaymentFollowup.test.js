import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
import ClientPaymentFollowup from '../ClientPaymentFollowup.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const preview=()=>({summary:{medicaid:false},from:'billing@example.com',ready:true,reviewHash:'synthetic-review-hash',blockers:[],recipients:[{kind:'family',userId:2,name:'DEMO QA Responsible Adult',email:'family@example.com'},{kind:'provider',userId:3,name:'DEMO QA Provider',email:'provider@example.com'}]});
const completed={id:8,status:'completed',deliveries:[{kind:'family',userId:2,status:'sent'},{kind:'provider',userId:3,status:'held'}]};
const button=(wrapper,label)=>wrapper.findAll('button').find(item=>item.text()===label);
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();api.get.mockResolvedValue({data:preview()});api.post.mockResolvedValue({data:completed});});
it('shows the exact recipients and billing identity before an explicit send, then reports sent versus held',async()=>{
 const w=mount(ClientPaymentFollowup,{props:{clientId:22}});expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
 await button(w,'Review payment request').trigger('click');await flushPromises();
 expect(w.text()).toContain('Medicaid: not applicable for this client.');expect(w.text()).toContain('From and reply to: billing@example.com');expect(w.text()).toContain('family@example.com');expect(w.text()).toContain('provider@example.com');expect(api.post).not.toHaveBeenCalled();
 await button(w,'Send payment setup request').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/22/payment-setup-followup',expect.objectContaining({requestKey:expect.any(String),reviewHash:'synthetic-review-hash'}),{skipGlobalLoading:true});
 expect(w.text()).toContain('DEMO QA Responsible Adult: Email sent');expect(w.text()).toContain('DEMO QA Provider: Held');expect(w.text()).toContain('Some messages were not confirmed sent');expect(sessionStorage.getItem('payment-setup-pending:22')).toBeNull();w.unmount();
});
it('does not offer a send for Medicaid or blocked previews',async()=>{
 api.get.mockResolvedValueOnce({data:{...preview(),summary:{medicaid:true}}});const w=mount(ClientPaymentFollowup,{props:{clientId:22}});
 await button(w,'Review payment request').trigger('click');await flushPromises();expect(w.text()).toContain('Medicaid: a payment method is not required.');expect(button(w,'Send payment setup request')).toBeUndefined();
 api.get.mockResolvedValueOnce({data:{...preview(),ready:false,blockers:['Payment collection is not configured.']}});
 await button(w,'Review payment request').trigger('click');await flushPromises();expect(w.text()).toContain('Payment collection is not configured.');expect(button(w,'Send payment setup request')).toBeUndefined();expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('recovers an uncertain send with its same key after remount instead of sending a new request',async()=>{
 api.post.mockRejectedValueOnce(new Error('Network timeout'));
 let w=mount(ClientPaymentFollowup,{props:{clientId:22}});await button(w,'Review payment request').trigger('click');await flushPromises();await button(w,'Send payment setup request').trigger('click');await flushPromises();
 const first=api.post.mock.calls[0][1];expect(button(w,'Review payment request').attributes('disabled')).toBeDefined();expect(w.text()).toContain('outcome is unknown');w.unmount();
 w=mount(ClientPaymentFollowup,{props:{clientId:22}});expect(button(w,'Retrieve saved request result')).toBeDefined();await button(w,'Retrieve saved request result').trigger('click');await flushPromises();
 expect(api.post.mock.calls[1][1]).toEqual(first);expect(api.get).toHaveBeenCalledTimes(1);expect(w.text()).toContain('Payment request #8');w.unmount();
});
it('clears a rejected changed review and permits a new recipient review without dispatching automatically',async()=>{
 api.post.mockRejectedValueOnce({response:{status:409,data:{error:{code:'PAYMENT_SETUP_REVIEW_REQUIRED',message:'Recipients or payment setup changed. Review the request again.'}}}});
 const w=mount(ClientPaymentFollowup,{props:{clientId:22}});await button(w,'Review payment request').trigger('click');await flushPromises();await button(w,'Send payment setup request').trigger('click');await flushPromises();
 expect(button(w,'Review payment request').attributes('disabled')).toBeUndefined();expect(sessionStorage.getItem('payment-setup-pending:22')).toBeNull();expect(button(w,'Send payment setup request')).toBeUndefined();expect(api.post).toHaveBeenCalledTimes(1);w.unmount();
});
it('discards another client’s delayed review and prevents a second click while sending',async()=>{
 let resolveOld;api.get.mockImplementationOnce(()=>new Promise(resolve=>resolveOld=resolve));const w=mount(ClientPaymentFollowup,{props:{clientId:22}});await button(w,'Review payment request').trigger('click');await w.setProps({clientId:23});resolveOld({data:preview()});await flushPromises();expect(w.text()).not.toContain('family@example.com');
 await button(w,'Review payment request').trigger('click');await flushPromises();let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));await button(w,'Send payment setup request').trigger('click');expect(button(w,'Checking request…').attributes('disabled')).toBeDefined();await button(w,'Checking request…').trigger('click');expect(api.post).toHaveBeenCalledTimes(1);
 await w.setProps({clientId:24});finish({data:completed});await flushPromises();expect(w.text()).not.toContain('Payment request #8');expect(sessionStorage.getItem('payment-setup-pending:23')).toBeNull();w.unmount();
});
