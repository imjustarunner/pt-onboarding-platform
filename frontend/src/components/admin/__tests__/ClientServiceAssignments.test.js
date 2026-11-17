import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mocks}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'support'}})}));
import Services from '../ClientServiceEnrollments.vue';
const service={id:11,service_kind:'counseling',label:'Counseling',organization_id:8,organization_name:'Therapy program',provider_user_id:0,is_active:1};
const provider={id:20,name:'Sam Provider',agencies:[{id:2,name:'Client agency'}]};
let wrapper;
beforeEach(()=>{
 vi.clearAllMocks();mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider,{id:99,name:'Unrelated',agencies:[{id:4,name:'Other agency'}]}]}}:{data:{services:[service]}});
 mocks.post.mockResolvedValue({data:{services:[{...service,provider_user_id:20,provider_name:'Sam Provider'}]}});
});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=mount(Services,{props:{clientId:7,agencyId:2,organizations:[]}});await flushPromises();return wrapper;}
it('uses only scoped provider options and updates the existing service by id',async()=>{
 await render();expect(mocks.get).toHaveBeenCalledWith('/office-clients/providers',expect.objectContaining({params:{clientId:7,agencyIds:'2'}}));
 expect(wrapper.text()).toContain('Needs a provider');
 await wrapper.findAll('button').find(b=>b.text()==='Assign provider').trigger('click');
 const input=wrapper.get('#service-provider-11');await input.trigger('focus');
 expect(wrapper.findAll('[role="option"]')).toHaveLength(1);expect(wrapper.text()).not.toContain('Unrelated');
 await wrapper.get('[role="option"]').trigger('click');await wrapper.get('.service-assignment').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',{agencyId:2,serviceId:11,serviceKind:'counseling',label:'Counseling',organizationId:8,providerUserId:20});
 expect(wrapper.text()).toContain('Assigned provider');expect(wrapper.emitted('updated')).toHaveLength(1);
});
it('shows a single counseling service with its existing provider and program',async()=>{
 const unified={...service,id:12,provider_user_id:21,provider_name:'Other Provider',source_service_ids:[11,12],providers:[{service_id:12,provider_user_id:21,provider_name:'Other Provider',organization_id:0}],organizations:[{id:8,name:'Therapy program'}]};
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[unified]}});
 await render();expect(wrapper.findAll('.services-list > li')).toHaveLength(1);expect(wrapper.text()).toContain('1 active service');expect(wrapper.text()).toContain('Therapy program');expect(wrapper.text()).toContain('Other Provider');expect(wrapper.text()).not.toContain('Needs a provider');expect(wrapper.find('.add-service').exists()).toBe(false);expect(mocks.delete).not.toHaveBeenCalled();
});
it('changes one provider inside a shared counseling service without replacing the other',async()=>{
 const unified={...service,id:11,provider_user_id:20,provider_name:'Sam Provider',source_service_ids:[11,12],providers:[{service_id:11,provider_user_id:20,provider_name:'Sam Provider',organization_id:8},{service_id:12,provider_user_id:21,provider_name:'Other Provider',organization_id:0}]};
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[unified]}});
 await render();expect(wrapper.findAll('.services-list > li')).toHaveLength(1);expect(wrapper.findAll('.service-providers-list > li')).toHaveLength(2);
 await wrapper.findAll('.service-providers-list button').filter(button=>button.text()==='Change')[1].trigger('click');const input=wrapper.get('#service-provider-11');await input.trigger('focus');await wrapper.get('[role="option"]').trigger('click');await wrapper.get('.service-assignment').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',expect.objectContaining({serviceId:12,providerUserId:20,organizationId:0}));
});
it('routes an attempted duplicate counseling creation to the existing provider editor',async()=>{
 await render();wrapper.vm.draft.serviceKind='counseling';await wrapper.vm.save();await flushPromises();expect(mocks.post).not.toHaveBeenCalled();expect(wrapper.find('.service-assignment').exists()).toBe(true);
});
it('keeps end-service history separate and does not reopen ended services while assigning',async()=>{
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[service,{...service,id:12,is_active:0}]}});
 await render();expect(wrapper.findAll('.services-list > li')).toHaveLength(1);expect(wrapper.get('.former-services summary').text()).toContain('1');
});
it('ignores an earlier service response after switching clients',async()=>{
 let finish;const slow=new Promise(resolve=>{finish=resolve;});mocks.get.mockImplementation(url=>url==='/office-clients/providers'?Promise.resolve({data:{providers:[provider]}}):url.includes('/7/')?slow:Promise.resolve({data:{services:[{...service,id:80,label:'New client service'}]}}));
 wrapper=mount(Services,{props:{clientId:7,agencyId:2}});await wrapper.setProps({clientId:8});await flushPromises();finish({data:{services:[{...service,label:'Old client service'}]}});await flushPromises();expect(wrapper.text()).toContain('New client service');expect(wrapper.text()).not.toContain('Old client service');
});
it('keeps services visible and explains a provider catalog failure',async()=>{
 mocks.get.mockImplementation(async url=>{if(url==='/office-clients/providers')throw new Error('Unavailable');return {data:{services:[service]}};});
 await render();expect(wrapper.text()).toContain('Therapy program');expect(wrapper.get('[role="alert"]').text()).toContain('Providers could not be loaded');
});

it('keeps new service edits pending until saved or canceled, including service type and school choices',async()=>{
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[service],availableServiceKinds:['counseling','tutoring','coaching']}});
 await render();expect(wrapper.vm.prepareLeave()).toBe(true);
 await wrapper.get('.add-service select').setValue('coaching');expect(wrapper.vm.prepareLeave()).toBe(false);expect(wrapper.emitted('busy').at(-1)).toEqual([true]);
 await wrapper.findAll('button').find(button=>button.text()==='Cancel new service').trigger('click');expect(wrapper.vm.prepareLeave()).toBe(true);expect(wrapper.emitted('busy').at(-1)).toEqual([false]);
 await wrapper.setProps({organizations:[{organization_id:8,organization_name:'School'}]});await wrapper.get('.add-service-form label:last-of-type select').setValue('8');expect(wrapper.vm.prepareLeave()).toBe(false);
 await wrapper.findAll('button').find(button=>button.text()==='Cancel new service').trigger('click');expect(wrapper.vm.prepareLeave()).toBe(true);expect(mocks.post).not.toHaveBeenCalled();
});

it('opens the office provider editor directly without requiring a weekday',async()=>{
 wrapper=mount(Services,{props:{clientId:7,agencyId:2,startAssigning:true}});await flushPromises();
 expect(wrapper.find('.service-assignment').exists()).toBe(true);expect(wrapper.text()).not.toContain('Assigned day');
 await wrapper.get('#service-provider-11').trigger('focus');await wrapper.get('[role="option"]').trigger('click');await wrapper.get('.service-assignment').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',expect.objectContaining({serviceId:11,providerUserId:20}));
 expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('service_day');
});
it('opens service creation for an office client with no enrollments yet',async()=>{
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[]}});
 wrapper=mount(Services,{props:{clientId:7,agencyId:2,startAssigning:true}});await flushPromises();
 expect(wrapper.get('.add-service').attributes()).toHaveProperty('open');
 await wrapper.get('#new-service-provider').trigger('focus');await wrapper.get('[role="option"]').trigger('click');await wrapper.get('.add-service-form').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',expect.objectContaining({agencyId:2,serviceKind:'counseling',providerUserId:20}));
});
it('offers only the agency’s enabled service types',async()=>{
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[],availableServiceKinds:['counseling']}});
 await render();expect(wrapper.findAll('.add-service option').map(option=>option.attributes('value'))).toEqual(['counseling']);expect(wrapper.text()).not.toContain('Coaching');expect(wrapper.text()).not.toContain('Tutoring');expect(wrapper.text()).not.toContain('School / program');
});
it('adds a second counselor within the counseling service and leaves the first assignment intact',async()=>{
 const assigned={...service,organization_id:0,provider_user_id:20,provider_name:'Sam Provider'};
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider,{...provider,id:21,name:'Other Counselor'}]}}:{data:{services:[assigned],availableServiceKinds:['counseling']}});
 await render();await wrapper.findAll('button').find(button=>button.text()==='Add provider').trigger('click');await wrapper.get('#service-provider-11').trigger('focus');
 expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
 await wrapper.findAll('[role="option"]').find(option=>option.text().includes('Other Counselor')).trigger('click');await wrapper.get('.service-assignment').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',{agencyId:2,serviceId:11,serviceKind:'counseling',label:'Counseling',organizationId:0,providerUserId:21,addProvider:true});
});
it('does not exclude a counselor from the picker for a different enabled service',async()=>{
 mocks.get.mockImplementation(async url=>url==='/office-clients/providers'?{data:{providers:[provider]}}:{data:{services:[{...service,provider_user_id:20,provider_name:'Sam Provider'}],availableServiceKinds:['counseling','tutoring']}});
 await render();await wrapper.get('#new-service-provider').trigger('focus');expect(wrapper.get('[role="option"]').text()).toContain('Sam Provider');
 await wrapper.get('[role="option"]').trigger('click');await wrapper.get('.add-service-form').trigger('submit');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/7/service-enrollments',expect.objectContaining({serviceKind:'tutoring',providerUserId:20}));
});
