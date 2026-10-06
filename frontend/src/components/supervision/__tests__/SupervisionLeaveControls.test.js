import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:{}})),post:vi.fn(async()=>({data:{}})),put:vi.fn(async()=>({data:{}}))}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:9,role:'provider'}})}));
vi.mock('../../../utils/activityTracker',()=>({suspendInactivityTimeout:vi.fn(),resumeInactivityTimeout:vi.fn()}));
vi.mock('../../../composables/consentedAudioCapture.js',()=>({createConsentedAudioCapture:()=>({start:vi.fn(),stop:vi.fn(),flush:vi.fn(),control:vi.fn()})}));
import GroupRoom from '../GroupSupervisionLiveRoom.vue';
import IndividualRoom from '../IndividualSupervisionLiveRoom.vue';
let wrapper;
beforeEach(()=>{vi.useFakeTimers();});
afterEach(async()=>{wrapper?.unmount();await flushPromises();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
const props={supervisionSessionId:101,isSupervisor:true,canEndForEveryone:true,isInLobby:false,token:'token',vonageSessionId:'room',applicationId:'app'};
it('puts Leave only first and keeps a cohost departure separate from End for everyone',async()=>{
  wrapper=shallowMount(GroupRoom,{props});await flushPromises();
  await wrapper.findAll('button').find(b=>b.text()==='Leave / End session').trigger('click');
  const dialog=wrapper.get('[role="dialog"]');expect(dialog.text()).toContain('participants can continue');
  expect(dialog.findAll('button')[0].text()).toBe('Leave only');await dialog.findAll('button')[0].trigger('click');
  expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);
});
it('leaves individual supervision without ending it, and requires confirmation to end it',async()=>{
  wrapper=shallowMount(IndividualRoom,{props});await flushPromises();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await wrapper.findAll('button').find(b=>b.text()==='Leave session').trigger('click');
  expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);expect(confirm).not.toHaveBeenCalled();
  const end=wrapper.findAll('button').find(b=>b.text()==='End for everyone');await end.trigger('click');
  expect(wrapper.emitted('leave')).toHaveLength(1);
  confirm.mockReturnValue(true);await end.trigger('click');expect(wrapper.emitted('leave')[1]).toEqual([{endForAll:true}]);
});
it.each([GroupRoom,IndividualRoom])('hides End for everyone when another host remains',async component=>{
  wrapper=shallowMount(component,{props:{...props,canEndForEveryone:false}});await flushPromises();
  const open=wrapper.findAll('button').find(b=>b.text()==='Leave / End session');
  if(open) await open.trigger('click');
  expect(wrapper.findAll('button').some(b=>b.text()==='End for everyone')).toBe(false);
  const scope=open?wrapper.get('[role="dialog"]'):wrapper;
  const leave=scope.findAll('button').find(b=>['Leave only','Leave session'].includes(b.text()));
  await leave.trigger('click');expect(wrapper.emitted('leave')).toEqual([[{endForAll:false}]]);
});
