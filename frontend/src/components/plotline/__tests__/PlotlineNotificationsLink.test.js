import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils';
import { reactive } from 'vue';
const m=vi.hoisted(()=>({get:vi.fn(),auth:null,route:null,canPoll:vi.fn(),resume:vi.fn(),theme:vi.fn(async()=>{})}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>m.auth}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({fetchAgencyTheme:m.theme})}));
vi.mock('../../../composables/useSessionPolling',()=>({canPollWorkspace:m.canPoll,useSessionPolling:m.resume}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../PlotlineCompanyFrame.vue',()=>({default:{template:'<div><slot /></div>'}}));
import Link from '../PlotlineNotificationsLink.vue';
import Shell from '../PlotlineWorkspaceShell.vue';
let wrapper;
const agency=()=>({id:463,slug:'juniper',name:'Juniper QA'});
const render=()=>{wrapper=mount(Link,{props:{agency:agency()},global:{stubs:{RouterLink:RouterLinkStub}}});return wrapper;};
beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks();m.auth=reactive({user:{id:1434}});m.route=reactive({fullPath:'/juniper/admin/hiring'});
  m.canPoll.mockReturnValue(true);m.get.mockResolvedValue({data:{unreadCount:3}});
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('exposes a scoped inbox and readable unread count directly in the Plotline navigation',async()=>{
  wrapper=mount(Shell,{props:{agency:agency()},global:{stubs:{RouterLink:RouterLinkStub}}});await flushPromises();
  const link=wrapper.findComponent(Link);expect(link.exists()).toBe(true);expect(link.attributes('aria-label')).toBe('Notifications for Juniper QA, 3 unread');
  expect(link.getComponent(RouterLinkStub).props('to')).toEqual({path:'/juniper/notifications',query:{agencyId:'463',scope:'inbox',status:'unread'}});
  expect(m.get).toHaveBeenCalledWith('/notifications/feed',{params:{agencyId:463,scope:'inbox',status:'unread',page:1,pageSize:1},skipGlobalLoading:true});
});
it('never uses another company’s count when the selected company has no unread items',async()=>{
  m.get.mockResolvedValue({data:{unreadCount:0,facets:{agencies:[{agencyId:464,unread:12}]}}});render();await flushPromises();
  expect(wrapper.find('.pl-notifications-badge').exists()).toBe(false);expect(wrapper.attributes('aria-label')).toBe('Notifications for Juniper QA');
});
it('drops an old company’s in-flight badge after switching companies',async()=>{
  let resolve;m.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));render();
  m.get.mockResolvedValue({data:{unreadCount:2}});await wrapper.setProps({agency:{id:464,slug:'maple',name:'Maple QA'}});await flushPromises();
  resolve({data:{unreadCount:99}});await flushPromises();
  expect(wrapper.text()).toContain('2');expect(wrapper.text()).not.toContain('99');
  expect(wrapper.getComponent(RouterLinkStub).props('to').path).toBe('/maple/notifications');
});
it('clears the prior actor’s count on sign-out and ignores a late response',async()=>{
  let resolve;m.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));render();m.auth.user=null;await flushPromises();
  resolve({data:{unreadCount:8}});await flushPromises();expect(wrapper.find('.pl-notifications-badge').exists()).toBe(false);expect(m.get).toHaveBeenCalledOnce();
});
it('stops background reads while locked and refreshes when the session resumes',async()=>{
  m.canPoll.mockReturnValue(false);render();await flushPromises();await vi.advanceTimersByTimeAsync(60000);expect(m.get).not.toHaveBeenCalled();
  m.canPoll.mockReturnValue(true);await m.resume.mock.calls[0][0]();await flushPromises();expect(m.get).toHaveBeenCalledOnce();
});
it('keeps the inbox link usable when its badge cannot load and refreshes on focus',async()=>{
  m.get.mockRejectedValueOnce(new Error('Network unavailable'));render();await flushPromises();
  expect(wrapper.text()).toContain('Notifications');expect(wrapper.find('.pl-notifications-badge').exists()).toBe(false);
  window.dispatchEvent(new Event('focus'));await flushPromises();expect(wrapper.text()).toContain('3');
});
it('refreshes after navigating back from reading an alert and removes its polling when unmounted',async()=>{
  render();await flushPromises();m.get.mockResolvedValue({data:{unreadCount:0}});
  m.route.fullPath='/juniper/admin/hiring/applicants?candidateId=1871';await flushPromises();expect(wrapper.find('.pl-notifications-badge').exists()).toBe(false);
  wrapper.unmount();wrapper=null;const calls=m.get.mock.calls.length;
  window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(120000);
  expect(m.get).toHaveBeenCalledTimes(calls);
});
