import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(async()=>({data:{sections:[]}}))}}));
import api from '../../../services/api';
import Panel from '../ProviderUpdateSectionPanel.vue';
beforeEach(()=>vi.clearAllMocks());
function render(){return mount(Panel,{props:{agencyId:2,mode:'token',token:'sample',recipient:{providerUserId:7,agencyId:2},section:{key:'contact_info',data:{contact:{personalEmail:'',phone:''}}}},global:{stubs:{WorkplaceHandbookReader:true,ProviderUpdateOfficeSchedule:true,ProviderUpdateAdminUpdateEmbed:true}}});}
it.each(['','invalid'])('requires a valid personal email %j on confirm without blocking partial draft saves',async value=>{
 const w=render();await flushPromises();const email=w.get('input[type=email]');expect(email.attributes('required')).toBeDefined();
 await email.setValue(value);await w.get('button.primary').trigger('click');await flushPromises();
 expect(w.get('[role=alert]').text()).toContain('personal email');expect(api.put).not.toHaveBeenCalled();
 await w.get('input[autocomplete=tel]').setValue('5551234567');
 expect(await w.vm.saveDraft()).toBe(true);
 expect(api.put).toHaveBeenCalledWith('/public/provider-update/sample/sections/contact_info',expect.objectContaining({completed:false,data:expect.objectContaining({contact:expect.objectContaining({personalEmail:value})})}));w.unmount();
});
it('confirms a valid personal email and displays save failures',async()=>{
 const w=render();await flushPromises();await w.get('input[type=email]').setValue('person@example.test');
 api.put.mockRejectedValueOnce({response:{data:{error:{message:'Could not save contact.'}}}});
 await w.get('button.primary').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toBe('Could not save contact.');
 await w.get('button.primary').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenLastCalledWith('/public/provider-update/sample/sections/contact_info',expect.objectContaining({completed:true,data:expect.objectContaining({contact:expect.objectContaining({personalEmail:'person@example.test'})})}));expect(w.emitted('saved')).toBeTruthy();w.unmount();
});
