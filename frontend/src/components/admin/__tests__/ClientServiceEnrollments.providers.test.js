import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ClientServiceEnrollments from '../ClientServiceEnrollments.vue';
import ProviderSearchSelect from '../../clients/ProviderSearchSelect.vue';

const { get, post, remove, patch, actor } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn(), patch: vi.fn(), actor: { user: { role: 'support' } } }));
vi.mock('../../../services/api', () => ({ default: { get, post, delete: remove, patch } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => actor }));
let wrapper;
beforeEach(() => {
  actor.user.role = 'support';
  post.mockReset(); remove.mockReset();patch.mockReset();
  vi.stubGlobal('confirm', () => true);
  get.mockReset().mockImplementation(async url => ({ data: url.includes('service-enrollments') ? { services: [],availableServiceKinds:['counseling','tutoring'] } : {providers:[
    { id: 1433, name: 'Avery QA', assignmentServicesByAgency:{450:['counseling','tutoring']}, agencyIds:[450] }
  ]} }));
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

it('saves the provider selected for a new service when completing records import',async()=>{
 post.mockResolvedValue({data:{services:[{id:1,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:1433,provider_name:'Avery QA'}]}});
 wrapper=mount(ClientServiceEnrollments,{props:{clientId:2434,agencyId:450}});await flushPromises();
 await wrapper.findComponent(ProviderSearchSelect).vm.$emit('update:modelValue',1433);await flushPromises();
 expect(await wrapper.vm.savePendingAssignments()).toBe(true);
 expect(post).toHaveBeenCalledExactlyOnceWith('/clients/2434/service-enrollments',expect.objectContaining({agencyId:450,serviceKind:'counseling',providerUserId:1433}),expect.objectContaining({headers:{'X-Agency-Id':'450'}}));
 expect(wrapper.text()).toContain('Avery QA');expect(wrapper.vm.hasWorkingDraft()).toBe(false);
});
it('retains a selected provider after a failed completion save and permits retry',async()=>{
 post.mockRejectedValueOnce({response:{data:{error:{message:'Assignment unavailable'}}}}).mockResolvedValueOnce({data:{services:[]}});
 wrapper=mount(ClientServiceEnrollments,{props:{clientId:2434,agencyId:450}});await flushPromises();
 wrapper.findComponent(ProviderSearchSelect).vm.$emit('update:modelValue',1433);await flushPromises();
 expect(await wrapper.vm.savePendingAssignments()).toBe(false);expect(wrapper.text()).toContain('Assignment unavailable');
 expect(wrapper.vm.workingDraft().newService.providerUserId).toBe(1433);expect(await wrapper.vm.savePendingAssignments()).toBe(true);
});
it('saves an edited existing service assignment through the same completion path',async()=>{
 const original=get.getMockImplementation();get.mockImplementation(async(url,...args)=>url.endsWith('/service-enrollments')?{data:{services:[{id:15,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:null}],availableServiceKinds:['counseling']}}:original(url,...args));
 post.mockResolvedValue({data:{services:[{id:15,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:1433}]}});
 wrapper=mount(ClientServiceEnrollments,{props:{clientId:2434,agencyId:450,startAssigning:true}});await flushPromises();
 wrapper.findAllComponents(ProviderSearchSelect)[0].vm.$emit('update:modelValue',1433);await flushPromises();
 expect(await wrapper.vm.savePendingAssignments()).toBe(true);
 expect(post).toHaveBeenCalledExactlyOnceWith('/clients/2434/service-enrollments',expect.objectContaining({agencyId:450,serviceId:15,providerUserId:1433}),expect.objectContaining({headers:{'X-Agency-Id':'450'}}));
});
it('leaves an unchosen provider and an unconfirmed closure pending without saving either',async()=>{
 get.mockResolvedValue({data:{services:[{id:15,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:null}],availableServiceKinds:['counseling']}});
 wrapper=mount(ClientServiceEnrollments,{props:{clientId:2434,agencyId:450,startAssigning:true}});await flushPromises();
 await wrapper.findAll('button').find(button=>button.text()==='Change status').trigger('click');
 expect(await wrapper.vm.savePendingAssignments()).toBe(true);expect(post).not.toHaveBeenCalled();expect(patch).not.toHaveBeenCalled();expect(wrapper.vm.hasWorkingDraft()).toBe(true);
});

it('uses the authorized limited provider projection for Support instead of an admin user directory', async () => {
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  expect(get).toHaveBeenCalledWith('/office-clients/providers', { params: { clientId:2434,agencyIds:'450',serviceAssignments:'1' },skipGlobalLoading:true,headers:{'X-Agency-Id':'450'} });
  expect(get.mock.calls.some(([url]) => url === '/users')).toBe(false);
  await wrapper.findComponent(ProviderSearchSelect).get('input').trigger('focus');
  expect(wrapper.get('[role=option]').text()).toContain('Avery QA');
});

it('preserves the normal authorized admin provider choices', async () => {
  actor.user.role = 'admin';
  get.mockImplementation(async url => ({ data: url.includes('service-enrollments') ? { services: [],availableServiceKinds:['counseling','tutoring'] } : {providers:[
    { id: 10, name: 'Admin Provider', assignmentServicesByAgency:{450:['counseling','tutoring']}, agencyIds:[450] },
    { id: 11, name: 'Other Agency Provider', assignmentServicesByAgency:{999:['counseling','tutoring']}, agencyIds:[999] }
  ]} }));
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  expect(get).toHaveBeenCalledWith('/office-clients/providers', { params: { clientId:2434,agencyIds:'450',serviceAssignments:'1' },skipGlobalLoading:true,headers:{'X-Agency-Id':'450'} });
  expect(wrapper.findComponent(ProviderSearchSelect).props('options').map(provider=>provider.id)).toEqual([10]);
  expect(get.mock.calls.some(([url])=>url==='/users')).toBe(false);
});

it('ignores a delayed provider response belonging to the prior child and agency', async () => {
  let release;
  get.mockImplementation(async (url, options) => {
    if (url.includes('service-enrollments')) return { data: { services: [] } };
    if (options.params.agencyIds === '450') return new Promise(resolve => { release = resolve; });
    return { data: {providers:[{ id: 20, name:'Current Provider', assignmentServicesByAgency:{999:['counseling','tutoring']}, agencyIds:[999] }]} };
  });
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  await wrapper.setProps({ clientId: 3000, agencyId: 999 }); await flushPromises();
  release({ data: {providers:[{ id: 1433,name:'Old Provider',assignmentServicesByAgency:{450:['counseling','tutoring']}, agencyIds:[450]}]} });
  await flushPromises();
  expect(wrapper.findComponent(ProviderSearchSelect).props('options').map(provider=>provider.id)).toEqual([20]);
});

it('clears the prior draft and ignores its delayed save after changing child', async () => {
  const initialGet=get.getMockImplementation();get.mockImplementation(async (url,...rest)=>{const response=await initialGet(url,...rest);if(url.includes('/3000/'))response.data.availableServiceKinds=['counseling'];return response;});
  let release;
  post.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  wrapper.vm.draft = { serviceKind: 'tutoring', label: 'Prior child service', providerUserId: 1433, organizationId: 451 };
  await wrapper.get('form').trigger('submit');
  await wrapper.setProps({ clientId: 3000, agencyId: 999 }); await flushPromises();
  expect(wrapper.vm.draft).toEqual({ serviceKind: 'counseling', label: '', providerUserId: 0, organizationId: 0 });
  release({ data: { services: [{ id: 1, label: 'Prior child service', is_active: true }] } });
  await flushPromises();
  expect(wrapper.text()).not.toContain('Prior child service');
  expect(post).toHaveBeenCalledWith('/clients/2434/service-enrollments', expect.objectContaining({ agencyId: 450 }),expect.objectContaining({headers:{'X-Agency-Id':'450'}}));
});

it('does not replace the next child’s services with a delayed End response', async () => {
  let release;
  patch.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  get.mockImplementation(async url => ({ data: url.includes('service-enrollments')
    ? { services: url.includes('/2434/') ? [{ id: 1, label: 'Old service', is_active: true }] : [] } : [] }));
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  await wrapper.findAll('button').find(button => button.text() === 'Change status').trigger('click');
  await wrapper.get('.status-editor select').setValue('discontinued');await wrapper.get('.status-editor textarea').setValue('Client stopped care');await wrapper.get('.status-editor input[type=checkbox]').setValue(true);await wrapper.get('.status-editor').trigger('submit');
  await wrapper.setProps({ clientId: 3000, agencyId: 999 }); await flushPromises();
  release({ data: { services: [{ id: 1, label: 'Old archived service', is_active: false }] } });
  await flushPromises();
  expect(wrapper.text()).not.toContain('Old archived service');
  expect(patch).toHaveBeenCalledWith('/clients/2434/service-enrollments/1/status', expect.objectContaining({agencyId:450,status:'discontinued',expectedStatus:'active',confirmed:true}));
});

it('lets an assigned provider record discontinued contact with a safe client preview and no directory access',async()=>{
 actor.user.role='provider';get.mockResolvedValue({data:{services:[{id:3,label:'Counseling',provider_name:'Dr. Example',is_active:1,service_status:'active'}]}});
 patch.mockResolvedValue({data:{services:[{id:3,label:'Counseling',is_active:0,service_status:'terminated'}]}});
 wrapper=mount(ClientServiceEnrollments,{props:{clientId:2434,agencyId:450}});await flushPromises();
 expect(get.mock.calls.map(([url])=>url)).toEqual(['/clients/2434/service-enrollments']);expect(wrapper.text()).not.toContain('Add service enrollment');
 await wrapper.findAll('button').find(b=>b.text()==='Change status').trigger('click');await wrapper.get('.status-editor select').setValue('terminated');
 await wrapper.findAll('.status-editor select')[1].setValue('discontinued_contact');expect(wrapper.text()).toContain('Client sees: Discontinued services');expect(wrapper.text()).toContain('unable to re-establish contact');
 await wrapper.get('.status-editor textarea').setValue('Internal outreach details.');await wrapper.get('.status-editor input[type=checkbox]').setValue(true);await wrapper.get('.status-editor').trigger('submit');await flushPromises();
 expect(patch).toHaveBeenCalledWith('/clients/2434/service-enrollments/3/status',expect.objectContaining({status:'terminated',closureReason:'discontinued_contact',reason:'Internal outreach details.',expectedStatus:'active'}));
});
