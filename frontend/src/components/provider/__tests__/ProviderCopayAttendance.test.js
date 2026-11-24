import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import {ref} from 'vue';
import Attendance from '../ProviderCopayAttendance.vue';
import {attendanceState,refreshAttendance} from '../sessionAttendance';
import {useAuthStore} from '../../../store/auth';
import api from '../../../services/api';

const mocks=vi.hoisted(()=>({open:vi.fn(),query:{}}));
vi.mock('vue-router',()=>({useRoute:()=>({query:mocks.query})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../composables/useAppointmentChange',()=>({useAppointmentChange:()=>({openWizard:mocks.open,workflow:ref(null),facts:{}})}));
const session={sessionId:30,appointmentId:70,clientId:12,clientLabel:'AB',startAt:'2026-11-23T16:00:00Z',documentationRequired:false};
let wrappers=[];
const render=props=>{const w=mount(Attendance,{props,global:{stubs:{AppointmentChangeWizard:true}}});wrappers.push(w);return w;};
const click=async(w,text)=>{await w.findAll('button').find(b=>b.text()===text).trigger('click');await flushPromises();};
beforeEach(()=>{
  setActivePinia(createPinia());useAuthStore().user={id:45,role:'provider'};
  vi.clearAllMocks();mocks.query={};
  Object.assign(attendanceState(2,45),{enabled:false,sessions:[],deferred:new Set(),loadedAt:0,pending:null,error:''});
  api.get.mockResolvedValue({data:{enabled:true,sessions:[{...session}],timezone:'America/Denver'}});
  api.post.mockImplementation(async(url,body)=>{
    api.get.mockResolvedValue({data:{enabled:true,sessions:body.occurred?[]:[{...session,documentationRequired:true}]}});
    return {data:{collection:{paid:body.occurred}}};
  });
});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];});

it('holds a No immediately without opening the missed-session wizard, with an explicit Finish later option',async()=>{
  const w=render({agencyId:2,appointmentId:70,compact:true});await flushPromises();await click(w,'No');
  expect(api.post).toHaveBeenCalledWith('/family-billing/provider/copay-attendance/30',{agencyId:2,occurred:false},{skipGlobalLoading:true});
  expect(mocks.open).not.toHaveBeenCalled();expect(w.text()).toContain('Copay held');
  await click(w,'Finish later');expect(w.text()).toContain('saved for later');expect(api.post).toHaveBeenCalledTimes(1);
  await click(w,'Review attendance');expect(w.text()).toContain('Complete details');
  await click(w,'Complete details');expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({appointmentId:70}));
});
it('Later leaves attendance unanswered and makes no payment or attendance write',async()=>{
  const w=render({agencyId:2});await flushPromises();await click(w,'Later');
  expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('copay stays on hold');
});
it('removes the prompt after Yes and refreshes all views of the same session with one shared request',async()=>{
  const a=render({agencyId:2}),b=render({agencyId:2,appointmentId:70,compact:true});await flushPromises();
  expect(api.get).toHaveBeenCalledTimes(1);await click(b,'Yes');
  expect(a.text()).not.toContain('Did this session occur?');expect(b.text()).toContain('Attendance recorded');
});
it('resolves an attendance prompt when a note or cancellation reports its saved change',async()=>{
  const w=render({agencyId:2});await flushPromises();api.get.mockResolvedValue({data:{enabled:true,sessions:[]}});
  window.dispatchEvent(new Event('session-attendance-changed'));await flushPromises();
  expect(w.text()).not.toContain('Did this session occur?');
});
it('discards an older in-flight response after attendance changes',async()=>{
  let finishOld;
  api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;}));
  const old=refreshAttendance(2,45);
  window.dispatchEvent(new Event('session-attendance-changed'));
  api.get.mockResolvedValue({data:{enabled:true,sessions:[]}});
  await refreshAttendance(2,45,{force:true});
  finishOld({data:{enabled:true,sessions:[session]}});await old;
  expect(attendanceState(2,45).sessions).toEqual([]);
});
it('does not show another appointment or choices from another signed-in user',async()=>{
  const w=render({agencyId:2,appointmentId:71});await flushPromises();expect(w.text()).toBe('');
  useAuthStore().user={id:99,role:'provider'};api.get.mockResolvedValue({data:{enabled:true,sessions:[]}});await flushPromises();expect(w.text()).toBe('');
});
it('keeps the prompt and shows an inline failure when attendance cannot be saved',async()=>{
  api.post.mockRejectedValue({response:{data:{error:{message:'Session has not ended.'}}}});
  const w=render({agencyId:2});await flushPromises();await click(w,'Yes');
  expect(w.get('[role="alert"]').text()).toContain('Session has not ended');expect(w.text()).toContain('Did this session occur?');
});
