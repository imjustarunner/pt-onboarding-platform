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
