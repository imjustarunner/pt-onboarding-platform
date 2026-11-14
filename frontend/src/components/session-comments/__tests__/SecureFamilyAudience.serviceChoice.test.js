import {expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Audience from '../SecureFamilyAudience.vue';
it('asks for the service when an account has several active services and sends the chosen context',async()=>{
 const api={post:vi.fn().mockRejectedValueOnce({response:{data:{error:{code:'FAMILY_SHARED_CONTEXT_REQUIRED',message:'Choose the service.',services:[{id:20,label:'Counseling',providerUserId:7},{id:21,label:'Tutoring',providerUserId:8}]}}}}).mockResolvedValue({data:{shared:true,agencyId:2,threadId:50,participants:[{id:7,name:'Provider'},{id:9,name:'Guardian'}]}}),get:vi.fn(async()=>({data:{acknowledged:true,version:'2026-11-11'}}))};
 const wrapper=mount(Audience,{props:{agencyId:2,clientId:31,personKey:'client:31@2',meId:7,required:true},global:{provide:{secureSessionCommentsApi:api}}});await flushPromises();expect(wrapper.vm.canSend).toBe(false);await wrapper.get('select').setValue(20);await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/messages/hub/ensure-thread',expect.objectContaining({serviceId:20}),{skipGlobalLoading:true});expect(wrapper.vm.recipientUserIds).toEqual([9]);expect(wrapper.vm.canSend).toBe(true);wrapper.unmount();
});
