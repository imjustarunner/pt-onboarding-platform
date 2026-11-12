import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { getStartupData } from '../../../services/startupRequests';
import Center from '../CommunicationsCenterView.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: {} })) } }));
vi.mock('../../../services/startupRequests', () => ({ getStartupData: vi.fn() }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5, role: 'admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Agency' }, userAgencies: [{ id: 2 }] }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn(async()=>{}), replace: vi.fn(async()=>{}) }) }));
vi.mock('../../../components/unifiedInbox/UnifiedInboxShell.vue', () => ({ default: { name: 'UnifiedInboxShell', template: '<div />' } }));
vi.mock('../../../components/messages/MessagesHubShell.vue', () => ({ default: { name:'MessagesHubShell', template: '<div />' } }));
vi.mock('../../../components/communications/ClinicalClientTexts.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/conversa/ConversaTeamCommunications.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/communications/CommunicationReviewQueue.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/communications/CommunicationsCenterAutomation.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/communications/CommunicationsCenterSchoolAlerts.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../../components/communications/CommunicationsCenterAdminUpdate.vue', () => ({ default: { template: '<div />' } }));
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });
it('mounts the inbox while summary counts are pending, and leaves it usable after a summary failure', async () => {
  let reject;
  getStartupData.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const wrapper = shallowMount(Center, { global: { stubs: { RouterLink: true } } });
  try {
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnifiedInboxShell' }).exists()).toBe(true);
    expect(wrapper.text()).toContain('Updating message counts');
    reject(new Error('timeout')); await flushPromises();
    expect(wrapper.findComponent({ name: 'UnifiedInboxShell' }).exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain('Retry');
  } finally { wrapper.unmount(); }
});

it('does not load the hidden personal inbox until visited and keeps both inboxes mounted afterward', async()=>{
 getStartupData.mockResolvedValue({});
 const wrapper=shallowMount(Center,{global:{stubs:{RouterLink:true}}});
 try{
  await flushPromises();expect(wrapper.findComponent({name:'MessagesHubShell'}).exists()).toBe(false);
  const shared=wrapper.findComponent({name:'UnifiedInboxShell'}).vm;
  await wrapper.findAll('button').find(button=>button.text().startsWith('My messages')).trigger('click');await flushPromises();
  expect(wrapper.findComponent({name:'MessagesHubShell'}).exists()).toBe(true);
  expect(wrapper.findComponent({name:'UnifiedInboxShell'}).vm).toBe(shared);
  await wrapper.findAll('button').find(button=>button.text().startsWith('Shared inbox')).trigger('click');await flushPromises();
  expect(wrapper.findComponent({name:'UnifiedInboxShell'}).vm).toBe(shared);
  expect(wrapper.findComponent({name:'MessagesHubShell'}).exists()).toBe(true);
 }finally{wrapper.unmount();}
});
