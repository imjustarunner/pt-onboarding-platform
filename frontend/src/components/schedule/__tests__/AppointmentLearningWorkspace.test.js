import { expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StaffTools from '../AppointmentStaffTools.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
beforeEach(()=>vi.clearAllMocks());
const data={agencyId:6,alert:{text:'',revision:0},canEdit:true,clients:[]};
it('offers only the authorized learning action and retains review errors without charging or messaging',async()=>{
 api.get.mockResolvedValue({data:{...data,canOpenLearningWorkspace:true}});
 api.post.mockRejectedValue({response:{data:{error:{message:'Confirm the student roster'}}}});
 const wrapper=mount(StaffTools,{props:{appointmentId:8}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Open learning session').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith('/appointments/8/learning-workspace',{}, {skipGlobalLoading:true});
 expect(wrapper.text()).toContain('Confirm the student roster');
 expect(wrapper.findAll('button').find(b=>b.text()==='Open learning session').attributes('disabled')).toBeUndefined();
});
it('does not offer a workspace for an unapproved appointment',async()=>{
 api.get.mockResolvedValue({data});const wrapper=mount(StaffTools,{props:{appointmentId:8}});await flushPromises();
 expect(wrapper.text()).not.toContain('Open learning session');expect(api.post).not.toHaveBeenCalled();
});
