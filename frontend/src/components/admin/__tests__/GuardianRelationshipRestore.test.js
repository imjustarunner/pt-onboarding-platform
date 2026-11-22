import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Restore from '../GuardianRelationshipRestore.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
it('restores the existing relationship only after an explicit review and reason',async()=>{
 const w=mount(Restore,{props:{clientId:4,guardianId:20}});await w.get('button').trigger('click');
 expect(w.get('button[type=submit]').attributes('disabled')).toBeDefined();
 await w.get('input[type=checkbox]').setValue(true);await w.get('input[maxlength]').setValue('Verified parent authority');
 api.post.mockResolvedValue({data:{ok:true,accessEnabled:true}});
 await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/4/guardians/20/restore',{relationshipVerified:true,accessMode:'care',accessReason:'Verified parent authority'},{skipGlobalLoading:true});
 expect(w.emitted('restored')).toEqual([[{ok:true,accessEnabled:true}]]);w.unmount();
});
it('supports restoring with portal access left disabled',async()=>{
 const w=mount(Restore,{props:{clientId:4,guardianId:20}});await w.get('button').trigger('click');
 await w.get('select').setValue('none');await w.get('input[type=checkbox]').setValue(true);await w.get('input[maxlength]').setValue('Restore the relationship for later access review');
 api.post.mockResolvedValue({data:{ok:true,accessEnabled:false}});await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/4/guardians/20/restore',expect.objectContaining({accessMode:'none'}),expect.anything());w.unmount();
});
it('retains the review on failure and ignores a response after account navigation',async()=>{
 const w=mount(Restore,{props:{clientId:4,guardianId:20}});await w.get('button').trigger('click');
 await w.get('input[type=checkbox]').setValue(true);await w.get('input[maxlength]').setValue('Verified parent authority');
 api.post.mockRejectedValueOnce({response:{data:{error:{message:'Access changed. Review again.'}}}});await w.get('form').trigger('submit');await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('Access changed');expect(w.emitted('restored')).toBeUndefined();
 let finish;api.post.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));await w.get('form').trigger('submit');await w.setProps({guardianId:21});
 finish({data:{ok:true}});await flushPromises();expect(w.emitted('restored')).toBeUndefined();w.unmount();
});
