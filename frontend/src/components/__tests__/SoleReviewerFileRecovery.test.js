import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Recovery from '../SoleReviewerFileRecovery.vue';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{post:vi.fn()}}));
let wrapper;
const headers={headers:{'X-Account-Security':'1'}};
const mountRecovery=()=>wrapper=mount(Recovery,{props:{ticketId:'ticket-owner'},global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});
const fill=async()=>{await wrapper.get('textarea').setValue('I reviewed my file activity and need to finish routine work.');await wrapper.get('input[type=checkbox]').setValue(true);};
beforeEach(()=>{vi.resetAllMocks();api.post.mockResolvedValue({data:{reviewed:true}});});
afterEach(()=>wrapper?.unmount());
it('requires an explicit work reason and confirmation before requesting a file reset',async()=>{
 mountRecovery();expect(wrapper.get('button[type=submit]').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();
 await fill();await wrapper.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/privacy-review/tickets/ticket-owner/review',{decision:'reset',note:'I reviewed my file activity and need to finish routine work.',soleReviewerRecovery:true,confirmOwnFileAccess:true},headers);
 expect(wrapper.emitted('reviewed')).toHaveLength(1);
});
it('keeps the request on denial and supports fresh verification with remembered-device use disabled',async()=>{
 api.post.mockRejectedValueOnce({response:{data:{error:{code:'MFA_FRESH_REQUIRED',message:'Enter a fresh authenticator code.'}}}});
 mountRecovery();await fill();await wrapper.get('form').trigger('submit');await flushPromises();expect(wrapper.emitted('reviewed')).toBeUndefined();
 expect(wrapper.get('[role=alert]').text()).toContain('fresh authenticator');
 await wrapper.get('input[autocomplete=one-time-code]').setValue('123456');await wrapper.findAll('form')[1].trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/account-security/authenticator/verify',{code:'123456',rememberDevice:false,personalDevice:false},headers);
 expect(wrapper.emitted('reviewed')).toBeUndefined();expect(wrapper.get('[role=status]').text()).toContain('click Restore');
});
it('keeps the user’s explanation if another reviewer becomes available before submission',async()=>{
 api.post.mockRejectedValue({response:{data:{error:{code:'SELF_APPROVAL_FORBIDDEN',message:'Another reviewer must handle this request.'}}}});
 mountRecovery();await fill();await wrapper.get('form').trigger('submit');await flushPromises();
 expect(wrapper.get('textarea').element.value).toContain('finish routine work');expect(wrapper.emitted('reviewed')).toBeUndefined();
});
