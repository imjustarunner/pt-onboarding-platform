import { beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, onMounted } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),leave:vi.fn(),user:{role:'support',billingAgencyIds:[2,3]}}));
vi.mock('../../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
import Assignments from '../ClientUpdateAssignments.vue';
const Services=defineComponent({name:'ClientServiceEnrollments',props:['clientId','agencyId','organizations'],emits:['loaded','updated','busy'],setup(props,{emit,expose}){expose({prepareLeave:m.leave});onMounted(()=>emit('loaded',{services:[{service_kind:'counseling',provider_user_id:props.clientId===7?20:30,is_active:1}]}));},template:'<div data-services>Services and providers</div>'});
let clients,member,assigned;
const offices=[{id:21,physical_office_location_id:9,agency_id:2,name:'Windchime',default_place_of_service:'11'},{id:22,physical_office_location_id:17,agency_id:2,name:'Second office',default_place_of_service:'11'},{id:31,agency_id:3,name:'Agency three office',default_place_of_service:'11'},{id:99,agency_id:9,name:'Other agency office',default_place_of_service:'11'}];
const locations=[{id:41,agency_id:2,billing_office_location_id:21,place_of_service:'11',name:'Windchime billing'},{id:42,agency_id:2,billing_office_location_id:22,place_of_service:'11'},{id:51,agency_id:3,billing_office_location_id:31,place_of_service:'11'}];
beforeEach(()=>{vi.clearAllMocks();m.user={role:'support',billingAgencyIds:[2,3]};m.leave.mockReturnValue(true);clients={7:{id:7,agency_id:2,client_type:'clinical',provider_id:20},8:{id:8,agency_id:3,client_type:'clinical',provider_id:30}};member={agency_id:2,agency_name:'ITSCO'};assigned={20:[{office_location_id:9,is_primary:1,is_active:1}],30:[{office_location_id:17,is_primary:1,is_active:1}]};
 m.get.mockImplementation(async url=>{
  if(/^\/clients\/\d+$/.test(url))return {data:clients[Number(url.split('/')[2])]};
  if(url.endsWith('/agency-affiliations'))return {data:[member]};
  if(url.endsWith('/affiliations'))return {data:[{organization_id:8,organization_name:'Grant',organization_type:'school',is_primary:1}]};
  if(url.endsWith('/affiliated-organizations'))return {data:[{id:8,name:'Grant',organization_type:'school'},{id:10,name:'New school',organization_type:'school'}]};
  if(url==='/offices')return {data:offices};
  if(url.includes('/service-locations'))return {data:{items:locations}};
  if(url.endsWith('/office-assignments'))return {data:{assigned:assigned[Number(url.split('/')[2])]||[]}};
  return {data:[]};
 });m.post.mockResolvedValue({data:{}});
});
async function render(){const wrapper=mount(Assignments,{props:{clientId:7,agencyId:2},global:{stubs:{ClientServiceEnrollments:Services}}});await flushPromises();return wrapper;}
it('prefills the provider physical office as this agency’s office and billing defaults, then saves on review',async()=>{
 const wrapper=await render();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('21');expect(wrapper.get('[aria-label="Default place of service"]').element.value).toBe('11');expect(wrapper.get('[aria-label="Default billing location"]').element.value).toBe('41');expect(m.post).not.toHaveBeenCalled();expect(wrapper.vm.prepareLeave()).toBe(false);
 await wrapper.get('.assignment-defaults').trigger('submit');await flushPromises();expect(m.post).toHaveBeenCalledWith('/clients/7/agency-affiliations',{agency_id:2,default_office_location_id:21,default_place_of_service:'11',default_service_location_id:41},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));expect(wrapper.vm.prepareLeave()).toBe(true);expect(wrapper.emitted('updated')).toHaveLength(1);wrapper.unmount();
});
it('preserves saved client overrides instead of replacing them with provider defaults',async()=>{
 member={...member,default_office_location_id:22,default_place_of_service:'02',default_service_location_id:42};const wrapper=await render();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('22');expect(wrapper.get('[aria-label="Default place of service"]').element.value).toBe('02');expect(m.get.mock.calls.some(([url])=>url==='/users/20/office-assignments')).toBe(false);expect(wrapper.vm.prepareLeave()).toBe(true);wrapper.unmount();
});
it('updates an unsaved automatic suggestion when the assigned service provider changes',async()=>{
 const wrapper=await render();wrapper.findComponent(Services).vm.$emit('updated',{services:[{service_kind:'counseling',provider_user_id:30,is_active:1}]});await flushPromises();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('22');expect(wrapper.get('[aria-label="Default billing location"]').element.value).toBe('42');wrapper.unmount();
});
it('keeps a manually selected office when the provider changes',async()=>{
 const wrapper=await render();await wrapper.get('[aria-label="Default office"]').setValue('22');wrapper.findComponent(Services).vm.$emit('updated',{services:[{service_kind:'counseling',provider_user_id:30,is_active:1}]});await flushPromises();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('22');expect(m.get.mock.calls.some(([url])=>url==='/users/30/office-assignments')).toBe(false);wrapper.unmount();
});
it('does not apply office-client defaults to school clients',async()=>{
 clients[7].client_type='school';const wrapper=await render();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('');expect(m.get.mock.calls.some(([url])=>url.includes('/office-assignments'))).toBe(false);wrapper.unmount();
});
it('blocks navigation while a provider edit is unfinished',async()=>{
 member={...member,default_office_location_id:21,default_place_of_service:'11'};const wrapper=await render();m.leave.mockReturnValue(false);expect(wrapper.vm.prepareLeave()).toBe(false);wrapper.unmount();
});
it('does not fetch or overwrite restricted billing-location settings for routine account support',async()=>{
 m.user={role:'support',billingAgencyIds:[]};member={...member,default_office_location_id:22,default_place_of_service:'11',default_service_location_id:42};const wrapper=await render();expect(m.get.mock.calls.some(([url])=>url.includes('/medical-billing/'))).toBe(false);await wrapper.get('[aria-label="Default office"]').setValue('21');await wrapper.get('.assignment-defaults').trigger('submit');await flushPromises();expect(m.post.mock.calls[0][1]).not.toHaveProperty('default_service_location_id');wrapper.unmount();
});
it('ignores a provider office response from the previously selected client',async()=>{
 let finish;const original=m.get.getMockImplementation();m.get.mockImplementation((url,config)=>url==='/users/20/office-assignments'?new Promise(resolve=>{finish=resolve}):original(url,config));const wrapper=mount(Assignments,{props:{clientId:7,agencyId:2},global:{stubs:{ClientServiceEnrollments:Services}}});await flushPromises();assigned[30]=[{office_location_id:31,is_primary:1,is_active:1}];await wrapper.setProps({clientId:8,agencyId:3});await flushPromises();finish({data:{assigned:assigned[20]}});await flushPromises();expect(wrapper.get('[aria-label="Default office"]').element.value).toBe('31');expect(wrapper.text()).not.toContain('Other agency office');wrapper.unmount();
});
