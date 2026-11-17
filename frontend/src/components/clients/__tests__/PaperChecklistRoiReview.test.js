import{mount,flushPromises}from'@vue/test-utils';import{it,expect,vi}from'vitest';
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,role:'support'}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';import Checklist from '../ClientOnboardingChecklistPanel.vue';
it.each([true,false])('keeps managed paper ROI in the processor while preserving the ordinary non-paper panel (paper=%s)',async paper=>{
 api.get.mockResolvedValue({data:{client:{id:2553,organization_id:451,organization_slug:'qa',roi_expires_at:'2029-11-12'},client_type:'school',is_paper_packet:paper,staff_items:[],provider_items:[],documents_item:{done:false},roi_staff_item:{done:false},summary:{}}});
 const w=mount(Checklist,{props:{clientId:2553},global:{stubs:{ClientOnboardingRoiStaffPanel:{name:'ClientOnboardingRoiStaffPanel',props:['readonly'],template:'<div data-test="roi" />'},ClientOnboardingStaffSetupPanel:true,ClientOnboardingDocumentsPanel:true,AssignDayModal:true,LifecycleActionModal:true}}});await flushPromises();expect(w.findComponent({name:'ClientOnboardingRoiStaffPanel'}).props('readonly')).toBe(paper);if(paper)expect(w.text()).toContain('Paper ROI permissions are shown here for reference');w.unmount();
});
it('shows paper review completion independently while retaining pending staff actions',async()=>{
 const staff=[{key:'provider',label:'Assign provider',done:false},{key:'service_day',label:'Assign service day',done:false}];
 api.get.mockResolvedValue({data:{client:{id:2553,organization_id:451,organization_slug:'qa'},client_type:'school',is_paper_packet:true,paper_packet_processed_at:'2026-11-17T15:00:00Z',staff_items:staff,provider_items:[],incomplete:staff,documents_item:{done:true},roi_staff_item:{done:true},open_count:2,summary:{}}});
 const w=mount(Checklist,{props:{clientId:2553},global:{stubs:{ClientOnboardingRoiStaffPanel:true,ClientOnboardingStaffSetupPanel:true,ClientOnboardingDocumentsPanel:true,AssignDayModal:true,LifecycleActionModal:true}}});await flushPromises();
 expect(w.text()).toContain('Paper packet review complete. Remaining profile actions are listed below.');expect(w.findAll('button').some(button=>button.text()==='View completed paper packet review')).toBe(true);expect(w.vm.checklist.incomplete).toEqual(staff);expect(w.vm.checklist.open_count).toBe(2);w.unmount();
});
