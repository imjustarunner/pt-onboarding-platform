import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../GuardianPendingEnrollment.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const data=name=>({invitations:[{id:28,children:[{id:6,name},{id:7,name:'Sibling'}],expired:false}]});
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:data('First child')});});
afterEach(()=>wrapper?.unmount());
it('shows both children’s outstanding enrollment and opens only that invitation',async()=>{
 wrapper=mount(View,{props:{agencyId:450,clientId:6}});await flushPromises();expect(wrapper.text()).toContain('First child · Sibling');
 api.post.mockRejectedValue({response:{data:{error:{message:'Please ask for a renewed invitation.'}}}});await wrapper.get('button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/pending-enrollments/28/open',{agencyId:450});expect(wrapper.text()).toContain('renewed invitation');
});
it('does not display a previous child’s late response after a profile switch',async()=>{
 let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));wrapper=mount(View,{props:{agencyId:450,clientId:6}});
 api.get.mockResolvedValueOnce({data:data('Selected child')});await wrapper.setProps({clientId:7});await flushPromises();finish({data:data('Old child')});await flushPromises();
 expect(wrapper.text()).toContain('Selected child');expect(wrapper.text()).not.toContain('Old child');
});
it('explains expiration without an actionable stale invitation',async()=>{
 const expired=data('Child');expired.invitations[0].expired=true;api.get.mockResolvedValue({data:expired});wrapper=mount(View,{props:{agencyId:450,clientId:6}});await flushPromises();
 expect(wrapper.text()).toContain('expired');expect(wrapper.find('button').exists()).toBe(false);
});
it('shows recovered enrollment to-dos and opens the own-draft route',async()=>{
 api.get.mockResolvedValue({data:{invitations:[],drafts:[{id:100,organizationName:'School',children:[{name:'Test child'}],tasks:['Sign the insurance authorization','Complete communication choices'],expired:false}]}});
 api.post.mockRejectedValue({response:{data:{error:{message:'Please renew this link'}}}});
 const w=mount(View,{props:{agencyId:450,clientId:20}});await flushPromises();
 expect(w.text()).toContain('remaining to-dos');expect(w.text()).toContain('Sign the insurance authorization');await w.find('button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/guardian-portal/enrollment-drafts/100/open',{agencyId:450});w.unmount();
});
