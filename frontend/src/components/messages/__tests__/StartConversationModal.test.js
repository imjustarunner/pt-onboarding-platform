import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Modal from '../StartConversationModal.vue';
import api from '../../../services/messagingApi';
vi.mock('../../../services/messagingApi', () => ({default:{get:vi.fn(),post:vi.fn()}}));
const alice={personKey:'user:10@2',displayName:'Alice',email:'alice@example.com',kinds:['staff']};
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({data:{sections:{staff:[alice]},results:[]}});
  api.post.mockResolvedValue({data:{person:alice}});
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
describe('new email recipient directory', () => {
  it('selects existing people without creating a conversation or loading client associations', async () => {
    wrapper=mount(Modal,{props:{agencyId:2,channel:'email'}}); await flushPromises();
    expect(wrapper.text()).toContain('Contacts & email groups');
    expect(wrapper.text()).not.toContain('Start a new group');
    expect(wrapper.text()).not.toContain('SMS · Coming soon');
    expect(api.get.mock.calls.map(([url])=>url)).toEqual(['/messages/hub/start-directory']);
    await wrapper.find('.scm-person').trigger('click');
    expect(wrapper.emitted('pick')[0]).toEqual([alice]);
    expect(api.post).not.toHaveBeenCalled();
  });
  it('disables people without an email rather than opening an empty email conversation', async () => {
    api.get.mockResolvedValue({data:{sections:{clients:[{personKey:'client:1@2',displayName:'Client',kinds:['client']}]}}});
    wrapper=mount(Modal,{props:{agencyId:2,channel:'email'}}); await flushPromises();
    expect(wrapper.find('.scm-person').element.disabled).toBe(true);
    expect(wrapper.find('.scm-person').attributes('title')).toContain('select a guardian');
  });
  it('prefills a new address, searches accessible clients on the server, and saves the selected association', async () => {
    vi.useFakeTimers();
    const client={personKey:'client:90@2',clientId:90,kinds:['client'],displayName:'Search Match',schoolName:'A School'};
    api.get.mockImplementation(async (url, options) => ({data:url.endsWith('start-directory') ? {sections:{},searching:true,externalHint:{channel:'email',value:'new@example.com'}} : url.endsWith('/people') ? {results:options.params.q ? [client] : []} : {}}));
    wrapper=mount(Modal,{props:{agencyId:2,channel:'email'}}); await flushPromises();
    await wrapper.find('.scm-external-card').trigger('click'); await flushPromises();
    expect(wrapper.find('input[type=email]').element.value).toBe('new@example.com');
    await wrapper.find('input[type=search]').setValue('Search Match'); await vi.advanceTimersByTimeAsync(220); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/messages/hub/people',expect.objectContaining({params:{agencyId:2,browse:'caseload',q:'Search Match',limit:40,allAgencies:false}}));
    await wrapper.find('.scm-client-results button').trigger('click');
    await wrapper.find('select').setValue('parent');
    await wrapper.find('.scm-footer .btn-primary').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/messages/hub/external-contact',expect.objectContaining({email:'new@example.com',clientId:'90',relationshipType:'parent'}),expect.anything());
    expect(wrapper.emitted('pick')[0][0]).toMatchObject({email:alice.email,composeChannel:'email'});
  });
  it('ignores stale client results and keeps failures visible without trapping the user', async () => {
    vi.useFakeTimers(); let finishOld;
    api.get.mockImplementation((url, options) => {
      if(url.endsWith('/people') && !options.params.q) return new Promise(resolve=>{finishOld=resolve;});
      if(url.endsWith('/people')) return Promise.reject(new Error('timeout'));
      return Promise.resolve({data:{}});
    });
    wrapper=mount(Modal,{props:{agencyId:2,channel:'email',contactOnly:true,initialEmail:'new@example.com'}}); await flushPromises();
    await wrapper.find('input[type=search]').setValue('Jane'); await vi.advanceTimersByTimeAsync(220); await flushPromises();
    finishOld({data:{results:[{clientId:90,personKey:'client:90@2',displayName:'Stale',kinds:['client']}]}}); await flushPromises();
    expect(wrapper.text()).toContain('Could not search clients');
    expect(wrapper.text()).not.toContain('Stale');
    await wrapper.find('.scm-close').trigger('click'); expect(wrapper.emitted('close')).toHaveLength(1);
  });
});

it('opens the full group directory and preserves the selected channel', async () => {
  api.get.mockImplementation(async url => ({ data: url.includes('start-directory') ? { sections: { groups: [{ personKey: 'group:42@2', groupId: 42, agencyId: 2, displayName: 'Denver', kinds: ['group', 'channel'] }] } } : {} }));
  wrapper = mount(Modal, { props: { agencyId: 2, channel: 'group' } });
  await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/messages/hub/start-directory', expect.objectContaining({ params: expect.objectContaining({ perSection: 40 }) }));
  await wrapper.findAll('button').find(b => b.text().includes('Denver')).trigger('click');
  expect(wrapper.emitted('open-group')[0][0]).toMatchObject({ groupId: 42, kinds: ['group', 'channel'] });
});

it('creates a named group direct message from multiple internal staff, with no channel or guardian candidates',async()=>{
 const people=[{...alice,userId:10},{personKey:'user:11@2',userId:11,displayName:'Beth',kinds:['employee','staff'],email:'beth@example.com'},{personKey:'user:12@2',userId:12,displayName:'Guardian',kinds:['guardian','staff']},{personKey:'user:13@2',userId:13,displayName:'School colleague',kinds:['school_staff']},{personKey:'user:14@2',userId:14,displayName:'Demo fixture',kinds:['staff'],isDemo:true}];
 api.get.mockImplementation(async url=>({data:url.endsWith('/people')?{results:people}:{sections:{}}}));
 api.post.mockResolvedValue({data:{threadId:42}});
 wrapper=mount(Modal,{props:{agencyId:2,channel:'internal'}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='New group direct message').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/messages/hub/people',{params:{agencyId:2,q:'',browse:'staff',limit:80},skipGlobalLoading:true});
 expect(wrapper.text()).toContain('Alice');expect(wrapper.text()).toContain('Beth');expect(wrapper.text()).not.toContain('Guardian');expect(wrapper.text()).not.toContain('School colleague');expect(wrapper.text()).not.toContain('Demo fixture');
 await wrapper.find('input[placeholder="e.g. Anniversary planning"]').setValue('Anniversary planning');
 await wrapper.findAll('input[type=checkbox]')[0].setValue(true);await wrapper.findAll('input[type=checkbox]')[1].setValue(true);
 await wrapper.findAll('button').find(b=>b.text()==='Create group message').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/chat/threads/group',{agencyId:2,userIds:[10,11],name:'Anniversary planning'},{skipGlobalLoading:true});
 expect(api.post.mock.calls.some(([url])=>url.includes('/channel'))).toBe(false);
 expect(wrapper.emitted('open-group')[0][0]).toMatchObject({kinds:['group'],groupId:42,displayName:'Anniversary planning'});
});
