import {beforeEach,describe,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import View from '../SchoolContactPlansView.vue';
import api from '../../../services/api';
import {useAgencyStore} from '../../../store/agency';
import {useAuthStore} from '../../../store/auth';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../store/agency',async()=>{const {reactive}=await import('vue');const store=reactive({currentAgency:null,currentAgencyId:450,selectedAgencyId:450});return {useAgencyStore:()=>store};});
vi.mock('../../../store/auth',async()=>{const {reactive}=await import('vue');const store=reactive({user:{role:'admin'}});return {useAuthStore:()=>store};});
beforeEach(()=>{vi.resetAllMocks();Object.assign(useAgencyStore(),{currentAgency:null,currentAgencyId:450,selectedAgencyId:450});useAuthStore().user={role:'admin'};api.get.mockResolvedValue({data:[{id:1433,first_name:'Avery',last_name:'QA',status:'declined',required:false,intake_followup_required:2}]});});
describe('SchoolContactPlansView agency administrator controls',()=>{
 it('uses the selected store agency ID and writes only the requirement, preserving provider opt-in',async()=>{
  const wrapper=mount(View);await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/school-contact-plan/providers',expect.objectContaining({params:{agencyId:450}}));
  expect(wrapper.text()).toContain('Declined');expect(wrapper.text()).toContain('Avery');
  api.put.mockResolvedValue({data:{required:true}});api.get.mockResolvedValue({data:[{id:1433,first_name:'Avery',status:'declined',required:true}]});
  await wrapper.find('input[type="checkbox"]').setValue(true);await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan/providers/1433/required',{required:true},expect.objectContaining({params:{agencyId:450}}));
  expect(wrapper.text()).toContain('Declined');expect(wrapper.find('input').element.checked).toBe(true);wrapper.unmount();
 });
 it('does not load or expose requirements to support',async()=>{
  useAuthStore().user={role:'support'};const wrapper=mount(View);await flushPromises();
  expect(api.get).not.toHaveBeenCalled();expect(wrapper.find('input').exists()).toBe(false);expect(wrapper.text()).toContain('administrator is required');wrapper.unmount();
 });
 it('drops a delayed demo response after changing agencies',async()=>{
  let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const wrapper=mount(View);
  useAgencyStore().currentAgencyId=7;await flushPromises();resolve({data:[{id:1433,first_name:'Old demo'}]});await flushPromises();
  expect(wrapper.text()).not.toContain('Old demo');expect(wrapper.find('table').exists()).toBe(false);wrapper.unmount();
 });
 it('keeps the checkbox unchanged and reports a rejected write',async()=>{
  const wrapper=mount(View);await flushPromises();api.put.mockRejectedValue({response:{status:403,data:{error:{message:'Access denied'}}}});
  await wrapper.find('input').setValue(true);await flushPromises();
  expect(wrapper.find('input').element.checked).toBe(false);expect(wrapper.find('[role="alert"]').text()).toContain('Access denied');wrapper.unmount();
 });
});
