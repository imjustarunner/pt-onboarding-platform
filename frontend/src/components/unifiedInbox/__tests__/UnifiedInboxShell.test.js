import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionLockStore } from '../../../store/sessionLock';
import { clearUnifiedInboxCache } from '../../../utils/unifiedInboxCache';
import Shell from '../UnifiedInboxShell.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5 } }) }));
const navigation=vi.hoisted(()=>({params:{},query:{}}));
vi.mock('vue-router', () => ({ useRoute: () => navigation, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
let wrapper;
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  clearUnifiedInboxCache();
  navigation.query={};
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
const render = async () => { wrapper = shallowMount(Shell, { props: { agencyId: 2 } }); await flushPromises(); };
describe('conversation switching', () => {
  it('loads existing conversations while mailbox provisioning is still pending', async () => {
    api.post.mockImplementation(() => new Promise(() => {}));
    api.get.mockImplementation(async url => ({ data: url === '/communications/conversations' ? { conversations: [{ id: 9 }] } : {} }));
    await render();
    expect(wrapper.findComponent({ name: 'UnifiedConversationList' }).props('conversations')).toEqual([{ id: 9 }]);
    expect(wrapper.findComponent({ name: 'UnifiedConversationList' }).props('loading')).toBe(false);
  });
  it('retries the inbox after a verified unlock without resending a message', async () => {
    await render(); const lock = useSessionLockStore();
    lock.lock(); await flushPromises(); api.get.mockClear(); api.post.mockClear();
    window.dispatchEvent(new Event('focus')); await flushPromises(); expect(api.get).not.toHaveBeenCalled();
    lock.unlock(); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/communications/conversations', expect.any(Object));
    expect(api.post.mock.calls.every(([url]) => url === '/communications/inboxes/personal/ensure')).toBe(true);
  });
  it('ignores sidebar and attention responses from the previous agency', async () => {
    let oldInboxes, oldAttention;
    api.get.mockImplementation((url, config) => {
      const aid = config?.params?.agencyId;
      if (url === '/communications/inboxes' && aid === 2) return new Promise(resolve => { oldInboxes = resolve; });
      if (url === '/communications/attention-summary' && aid === 2) return new Promise(resolve => { oldAttention = resolve; });
      return Promise.resolve({ data: url === '/communications/inboxes' ? { inboxes: [{ id: 300, display_name: 'Agency three' }] }
        : url === '/communications/attention-summary' ? { summary: { needsAttention: 3 } } : {} });
    });
    await render();
    await wrapper.setProps({ agencyId: 3 }); await flushPromises();
    oldInboxes({ data: { inboxes: [{ id: 200, display_name: 'Agency two' }] } });
    oldAttention({ data: { summary: { needsAttention: 2 } } }); await flushPromises();
    const sidebar = wrapper.findComponent({ name: 'UnifiedInboxSidebar' });
    expect(sidebar.props('inboxes')[0].id).toBe(300);
    expect(sidebar.props('attention').needsAttention).toBe(3);
  });
  it('marks the observer read independently and refreshes the queues after claiming', async () => {
    const conversation = { id: 9, channel: 'email', is_ticketed_group: true, support_ticket_id: 7, is_unread: true, ticket_claimed_by_user_id: null };
    api.get.mockImplementation(async (url) => ({ data: url === '/communications/conversations'
      ? { conversations: [{ ...conversation }] }
      : url === '/communications/conversations/9' ? { conversation: { ...conversation }, messages: [] } : {} }));
    await render();
    wrapper.findComponent({ name: 'UnifiedConversationList' }).vm.$emit('select', 9);
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnifiedConversationList' }).props('conversations')[0].is_unread).toBe(false);
    conversation.ticket_claimed_by_user_id = 5;
    wrapper.findComponent({ name: 'UnifiedConversationThread' }).vm.$emit('claim-ticket');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/communications/conversations/9/claim', {}, expect.any(Object));
    expect(wrapper.findComponent({ name: 'UnifiedConversationThread' }).props('detail').conversation.ticket_claimed_by_user_id).toBe(5);
    expect(api.get.mock.calls.filter(([url]) => url === '/communications/conversations').length).toBeGreaterThan(1);
  });
  it('keeps the clicked conversation open if an earlier request completes later', async () => {
    await render();
    const pending = new Map();
    api.get.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)));
    const list = wrapper.findComponent({ name: 'UnifiedConversationList' });
    list.vm.$emit('select', 1);
    list.vm.$emit('select', 2);
    pending.get('/communications/conversations/2')({ data: { conversation: { id: 2 }, messages: [] } });
    await flushPromises();
    pending.get('/communications/conversations/1')({ data: { conversation: { id: 1 }, messages: [] } });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnifiedConversationThread' }).props('detail').conversation.id).toBe(2);
  });
  it('saves a delayed draft to the thread it came from after selection changes', async () => {
    await render();
    vi.useFakeTimers();
    const thread = wrapper.findComponent({ name: 'UnifiedConversationThread' });
    thread.vm.$emit('draft', 'For conversation one', 1);
    wrapper.findComponent({ name: 'UnifiedConversationList' }).vm.$emit('select', 2);
    await vi.advanceTimersByTimeAsync(801);
    expect(api.patch).toHaveBeenCalledWith('/communications/conversations/1', { draftBody: 'For conversation one' }, expect.any(Object));
  });
});

it('opens the received group email from a notification link without creating a ticket',async()=>{
 navigation.query={conversationId:'42',agencyId:'2'};
 api.get.mockImplementation(async url=>({data:url==='/communications/conversations/42'?{conversation:{id:42,channel:'email',is_group_email:true,is_ticketed_group:false},messages:[]}:{}}));
 await render();
 expect(api.get.mock.calls.some(([url])=>url==='/communications/conversations/42')).toBe(true);
 expect(wrapper.findComponent({name:'UnifiedConversationThread'}).props('detail').conversation.id).toBe(42);
 expect(api.post.mock.calls.some(([url])=>url.includes('/claim'))).toBe(false);
});

it('keeps messages visible during background refresh and coalesces focus while a request is running', async () => {
  api.get.mockImplementation(async url => ({data: url === '/communications/conversations' ? {conversations:[{id:9,subject:'Kept'}]} : {}}));
  await render();
  let finish;
  api.get.mockImplementation(url => url === '/communications/conversations' ? new Promise(resolve => {finish=resolve;}) : Promise.resolve({data:{}}));
  api.get.mockClear();
  window.dispatchEvent(new Event('focus')); await flushPromises();
  window.dispatchEvent(new Event('focus')); await flushPromises();
  const list=wrapper.findComponent({name:'UnifiedConversationList'});
  expect(list.props('conversations')).toEqual([{id:9,subject:'Kept'}]);
  expect(api.get.mock.calls.filter(([url])=>url==='/communications/conversations')).toHaveLength(1);
  finish({data:{conversations:[{id:9,subject:'Updated'}]}});await flushPromises();
  expect(list.props('conversations')[0].subject).toBe('Updated');
});
it('restores the last folder and messages immediately when returning to the workspace', async () => {
  api.get.mockImplementation(async url=>({data:url==='/communications/conversations'?{conversations:[{id:9}]}:{}}));
  await render();
  wrapper.findComponent({name:'UnifiedInboxSidebar'}).vm.$emit('update:selectedInboxId',12);await flushPromises();
  wrapper.unmount();
  api.get.mockImplementation(()=>new Promise(()=>{}));
  await render();
  expect(wrapper.findComponent({name:'UnifiedInboxSidebar'}).props('selectedInboxId')).toBe(12);
  expect(wrapper.findComponent({name:'UnifiedConversationList'}).props('conversations')).toEqual([{id:9}]);
});
it('shows open tickets within the same conversation list', async()=>{
  await render();api.get.mockClear();
  wrapper.findComponent({name:'UnifiedInboxSidebar'}).vm.$emit('open-tickets');await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/communications/conversations',expect.objectContaining({params:expect.objectContaining({filter:'tickets'})}));
});
it('does not let a delayed folder response replace the newly selected folder', async()=>{
  await render();const pending=[];
  api.get.mockImplementation((url,config)=>url==='/communications/conversations'?new Promise(resolve=>pending.push({resolve,config})):Promise.resolve({data:{}}));
  const side=wrapper.findComponent({name:'UnifiedInboxSidebar'});
  side.vm.$emit('update:selectedInboxId',12);await flushPromises();
  side.vm.$emit('update:selectedInboxId',4);await flushPromises();
  expect(pending[0].config.signal.aborted).toBe(true);
  pending[1].resolve({data:{conversations:[{id:40}]}});await flushPromises();
  pending[0].resolve({data:{conversations:[{id:12}]}});await flushPromises();
  expect(wrapper.findComponent({name:'UnifiedConversationList'}).props('conversations')).toEqual([{id:40}]);
});

it('does not poll the shared inbox when its tab is hidden',async()=>{
 await render();await wrapper.setProps({active:false});api.get.mockClear();
 window.dispatchEvent(new Event('focus'));await flushPromises();expect(api.get).not.toHaveBeenCalled();
 await wrapper.setProps({active:true});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/communications/conversations',expect.any(Object));
});
