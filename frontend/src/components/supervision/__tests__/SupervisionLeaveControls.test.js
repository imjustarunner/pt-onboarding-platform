import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../../services/api',()=>({isApiRateLimited:()=>false,default:{get:vi.fn(async()=>({data:{}})),post:vi.fn(async()=>({data:{}})),put:vi.fn(async()=>({data:{}}))}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:9,role:'provider'}})}));
vi.mock('../../../utils/activityTracker',()=>({suspendInactivityTimeout:vi.fn(),resumeInactivityTimeout:vi.fn()}));
vi.mock('../../../composables/consentedAudioCapture.js',()=>({createConsentedAudioCapture:()=>({start:vi.fn(),stop:vi.fn(),flush:vi.fn(),control:vi.fn()})}));
import api from '../../../services/api';
import GroupRoom from '../GroupSupervisionLiveRoom.vue';
import IndividualRoom from '../IndividualSupervisionLiveRoom.vue';
let wrapper;
beforeEach(()=>{vi.useFakeTimers();});
afterEach(async()=>{wrapper?.unmount();await flushPromises();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
async function exitFullVideo() {
  wrapper.findComponent({ name: 'SupervisionVideoRoom' }).vm.$emit('update:videoFullscreen', false);
  await flushPromises();
}
const props={supervisionSessionId:101,isSupervisor:true,canEndForEveryone:true,isInLobby:false,token:'token',vonageSessionId:'room',applicationId:'app'};
it('puts leaving without ending first and keeps meeting closure separate',async()=>{
  wrapper=shallowMount(GroupRoom,{props});await flushPromises();await exitFullVideo();
  await wrapper.findAll('button').find(b=>b.text()==='Leave / End session').trigger('click');
  const dialog=wrapper.get('[role="dialog"]');expect(dialog.text()).toContain('participants can continue');
  expect(dialog.findAll('button')[0].text()).toBe('Leave without ending');await dialog.findAll('button')[0].trigger('click');
  expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);
});
it('keeps individual supervision departure separate from the parent-confirmed end action',async()=>{
  wrapper=shallowMount(IndividualRoom,{props});await flushPromises();await exitFullVideo();
  await wrapper.findAll('button').find(b=>b.text()==='Leave session').trigger('click');
  expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);
  const end=wrapper.findAll('button').find(b=>b.text()==='Leave and end meeting for everyone');await end.trigger('click');
  expect(wrapper.emitted('leave')[1]).toEqual([{endForAll:true}]);
});
it.each([GroupRoom,IndividualRoom])('hides ending for everyone for an unassigned supervisor',async component=>{
  wrapper=shallowMount(component,{props:{...props,canEndForEveryone:false}});await flushPromises();await exitFullVideo();
  const open=wrapper.findAll('button').find(b=>b.text()==='Leave / End session');
  if(open) await open.trigger('click');
  expect(wrapper.findAll('button').some(b=>b.text()==='Leave and end meeting for everyone')).toBe(false);
  const scope=open?wrapper.get('[role="dialog"]'):wrapper;
  const leave=scope.findAll('button').find(b=>['Leave without ending','Leave session'].includes(b.text()));
  await leave.trigger('click');expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);
});

it.each([GroupRoom, IndividualRoom])('starts an empty session with equal full-screen videos and reveals new shared content', async component => {
  let goals = [];
  api.get.mockImplementation(async url => ({ data: url.includes('/artifacts') ? { artifact: { goals } } : url === '/meeting-agendas' ? { items: [] } : {} }));
  wrapper = shallowMount(component, { props });
  await flushPromises();
  let video = wrapper.findComponent({ name: 'SupervisionVideoRoom' });
  expect(video.props('tileFocus')).toBe('equal');
  expect(video.props('videoFullscreen')).toBe(true);
  goals = [{ id: 'goal-1', text: 'A goal added by the other participant' }];
  await vi.advanceTimersByTimeAsync(8000);
  await flushPromises();
  video = wrapper.findComponent({ name: 'SupervisionVideoRoom' });
  expect(video.props('videoFullscreen')).toBe(false);
});
