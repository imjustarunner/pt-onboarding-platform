import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
import api from '../../../../services/api';
import Panel from '../SchoolAdminAccessRequests.vue';
const data={hasAdmin:false,canRequest:true,canReview:false,requests:[]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data});api.post.mockResolvedValue({data:{}});api.patch.mockResolvedValue({data:{}});});
it('requests access once and shows pending status without granting permissions',async()=>{
 const w=mount(Panel,{props:{schoolOrganizationId:357}});await flushPromises();
 api.get.mockResolvedValue({data:{...data,requests:[{id:1,status:'pending'}]}});
 await w.get('button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/school-portal/357/school-admin-requests');expect(w.text()).toContain('awaiting review');expect(w.find('button').exists()).toBe(false);expect(w.emitted('approved')).toBeUndefined();w.unmount();
});
it('shows scoped reviewer approval controls and includes a review note',async()=>{
 api.get.mockResolvedValue({data:{...data,canRequest:false,canReview:true,requests:[{id:2,status:'pending',requester_name:'School Staff'}]}});
 const w=mount(Panel,{props:{schoolOrganizationId:357}});await flushPromises();await w.get('input').setValue('Confirmed with school');
 await w.findAll('button')[0].trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/school-portal/357/school-admin-requests/2',{decision:'approve',note:'Confirmed with school'});expect(w.emitted('approved')).toHaveLength(1);w.unmount();
});
it('disables approval after an admin exists while allowing denial',async()=>{
 api.get.mockResolvedValue({data:{...data,hasAdmin:true,canRequest:false,canReview:true,requests:[{id:2,status:'pending'}]}});
 const w=mount(Panel,{props:{schoolOrganizationId:357}});await flushPromises();expect(w.findAll('button')[0].element.disabled).toBe(true);expect(w.findAll('button')[1].element.disabled).toBe(false);w.unmount();
});
it('ignores an older school response after switching schools',async()=>{
 let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>resolve=r));
 const w=mount(Panel,{props:{schoolOrganizationId:357}});api.get.mockResolvedValue({data:{hasAdmin:true,canRequest:false,canReview:false,requests:[]}});
 await w.setProps({schoolOrganizationId:237});await flushPromises();resolve({data});await flushPromises();expect(w.find('section').exists()).toBe(false);w.unmount();
});
