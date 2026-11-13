import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ClientServiceEnrollments from '../ClientServiceEnrollments.vue';

const { get, post, remove, patch, actor } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn(), patch: vi.fn(), actor: { user: { role: 'support' } } }));
vi.mock('../../../services/api', () => ({ default: { get, post, delete: remove, patch } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => actor }));
let wrapper;
beforeEach(() => {
  actor.user.role = 'support';
  post.mockReset(); remove.mockReset();patch.mockReset();
  vi.stubGlobal('confirm', () => true);
  get.mockReset().mockImplementation(async url => ({ data: url.includes('service-enrollments') ? { services: [] } : [
    { supervisee_id: 1433, supervisee_first_name: 'Avery', supervisee_last_name: 'QA' }
  ] }));
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

it('uses the authorized limited provider projection for Support instead of an admin user directory', async () => {
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  expect(get).toHaveBeenCalledWith('/users/me/providers-for-support', { params: { agencyId: 450 } });
  expect(get.mock.calls.some(([url]) => url === '/users')).toBe(false);
  expect(wrapper.find('option[value="1433"]').text()).toBe('Avery QA');
});

it('preserves the normal authorized admin provider choices', async () => {
  actor.user.role = 'admin';
  get.mockImplementation(async url => ({ data: url.includes('service-enrollments') ? { services: [] } : [
    { id: 10, first_name: 'Admin', last_name: 'Provider', role: 'provider' },
    { id: 11, first_name: 'Guardian', role: 'guardian' }
  ] }));
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  expect(get).toHaveBeenCalledWith('/users', { params: { agencyId: 450 } });
  expect(wrapper.find('option[value="10"]').exists()).toBe(true);
  expect(wrapper.find('option[value="11"]').exists()).toBe(false);
});

it('ignores a delayed provider response belonging to the prior child and agency', async () => {
  let release;
  get.mockImplementation(async (url, options) => {
    if (url.includes('service-enrollments')) return { data: { services: [] } };
    if (options.params.agencyId === 450) return new Promise(resolve => { release = resolve; });
    return { data: [{ supervisee_id: 20, supervisee_first_name: 'Current', supervisee_last_name: 'Provider' }] };
  });
  wrapper = mount(ClientServiceEnrollments, { props: { clientId: 2434, agencyId: 450 } });
  await flushPromises();
  await wrapper.setProps({ clientId: 3000, agencyId: 999 }); await flushPromises();
  release({ data: [{ supervisee_id: 1433, supervisee_first_name: 'Old', supervisee_last_name: 'Provider' }] });
  await flushPromises();
  expect(wrapper.find('option[value="20"]').exists()).toBe(true);
  expect(wrapper.find('option[value="1433"]').exists()).toBe(false);
});

it('clears the prior draft and ignores its delayed save after changing child', async () => {
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
  expect(post).toHaveBeenCalledWith('/clients/2434/service-enrollments', expect.objectContaining({ agencyId: 450 }));
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
