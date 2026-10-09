import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'provider'}})}));
import Modal from '../LifecycleActionModal.vue';
beforeEach(()=>{vi.clearAllMocks();Element.prototype.scrollIntoView=vi.fn();});
const render=()=>mount(Modal,{props:{client:{id:12},actionKey:'confirm_services_started'},global:{stubs:{Teleport:true}}});
it('saves the chosen completed-session date, refreshes the parent and closes the modal after success',async()=>{
 api.post.mockResolvedValue({data:{message:'Being Seen confirmed.'}});const w=render();await w.get('input[type="date"]').setValue('2026-10-01');await w.get('.btn-primary').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/12/confirm-services-started',{serviceDate:'2026-10-01'});expect(w.emitted('saved')).toHaveLength(1);expect(w.emitted('close')).toHaveLength(1);expect(w.text()).toContain('returning client from last fall');w.unmount();
});
it('keeps the modal and date open with an error when the save fails',async()=>{
 api.post.mockRejectedValue({response:{data:{error:{message:'Could not save date'}}}});const w=render();await w.get('input[type="date"]').setValue('2026-10-01');await w.get('.btn-primary').trigger('click');await flushPromises();
 expect(w.emitted('saved')).toBeUndefined();expect(w.emitted('close')).toBeUndefined();expect(w.get('input').element.value).toBe('2026-10-01');expect(w.text()).toContain('Could not save date');w.unmount();
});
