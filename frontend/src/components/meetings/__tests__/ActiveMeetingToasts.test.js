import {flushPromises,mount} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import { startLiveMeetingPresence } from '../../../utils/liveMeetingPresence';
import ActiveMeetingToasts from '../ActiveMeetingToasts.vue';
const mock=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),route:{},mini:{},auth:{user:{id:7}},agency:{currentAgency:{id:450}},lock:{isLocked:false,verificationFailed:false}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>mock.auth}));vi.mock('../../../store/agency',()=>({useAgencyStore:()=>mock.agency}));vi.mock('../../../store/sessionLock',()=>({useSessionLockStore:()=>mock.lock}));
vi.mock('../../../services/api',()=>({default:{get:mock.get}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:mock.push}),useRoute:()=>mock.route}));
vi.mock('../../../composables/useActiveMeeting',()=>({useActiveMeeting:()=>({state:mock.mini})}));
describe('active meeting notices',()=>{
  beforeEach(()=>{
    mock.auth=reactive({user:{id:7}});mock.agency=reactive({currentAgency:{id:450}});mock.lock=reactive({isLocked:false,verificationFailed:false});
    vi.useFakeTimers(); vi.clearAllMocks();localStorage.clear(); mock.route=reactive({path:'/dashboard'});mock.mini=reactive({active:false});
    mock.get.mockResolvedValue({data:{prompts:[{key:'team_meeting:1',title:'Leadership',isLive:true,previouslyJoined:true,joinUrl:'https://tenant.example/join/team-meeting/opaque'},{key:'supervision:2',title:'Supervision',isLive:true,joinUrl:'/join/supervision/2'}]}});
  });
  afterEach(()=>vi.useRealTimers());
  it('loads on login, shows every invitation, navigates rejoin in the same tab',async()=>{
    const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
    expect(w.findAll('.active-meeting-toast')).toHaveLength(2);
    await w.findAll('button').find(b=>b.text()==='Rejoin').trigger('click');
    expect(mock.push).toHaveBeenCalledWith('/join/team-meeting/opaque');
    await vi.advanceTimersByTimeAsync(15000);
    expect(mock.get).toHaveBeenCalledTimes(2);w.unmount();
  });
  it('does not cover an active room or mini and respects dismissal across polls',async()=>{
    const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
    await w.get('[aria-label="Dismiss Leadership for this meeting"]').trigger('click');
    await vi.advanceTimersByTimeAsync(15000);
    expect(w.text()).not.toContain('Leadership');
    mock.route.path='/brand/join/team-meeting/opaque';await flushPromises();expect(w.find('aside').exists()).toBe(false);
    mock.route.path='/dashboard';mock.mini.active=true;await flushPromises();expect(w.find('aside').exists()).toBe(false);
    mock.mini.connected=false;await flushPromises();expect(w.text()).toContain('Supervision');
    mock.mini.active=false;await flushPromises();expect(w.text()).toContain('Supervision');w.unmount();
    const count=mock.get.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(mock.get).toHaveBeenCalledTimes(count);
  });
  it('keeps dismissals after remount and isolates them by account',async()=>{
    let w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();await w.get('[aria-label="Dismiss Leadership for this meeting"]').trigger('click');w.unmount();
    w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();expect(w.text()).not.toContain('Leadership');mock.auth.user={id:8};await w.setProps({userId:8});await flushPromises();expect(w.text()).toContain('Leadership');w.unmount();
  });
  it('announces a new arrival and waiting count, resurfacing a dismissed meeting once per arrival', async () => {
    const meeting={key:'team_meeting:1',title:'Supervisors meeting',isLive:true,presentCount:2,waitingCount:1,
      latestJoin:{key:'user-8:first',displayName:'Rachel',joinedAt:new Date().toISOString()}};
    mock.get.mockResolvedValue({data:{prompts:[meeting]}});
    const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
    expect(w.text()).toContain('Rachel joined the meeting.');expect(w.text()).toContain('2 people here');expect(w.text()).toContain('1 waiting for admission');
    await w.get('[aria-label="Dismiss Supervisors meeting for this meeting"]').trigger('click');
    await vi.advanceTimersByTimeAsync(15000);expect(w.find('aside').exists()).toBe(false);
    meeting.latestJoin={key:'user-8:rejoined',displayName:'Rachel',joinedAt:new Date().toISOString()};
    await vi.advanceTimersByTimeAsync(15000);expect(w.text()).toContain('Rachel joined the meeting.');
    expect(w.find('.active-meeting-toast--arrival').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(90000);expect(w.text()).not.toContain('Rachel joined the meeting.');w.unmount();
  });
  it('clears ended meetings on the next poll',async()=>{
    const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
    mock.get.mockResolvedValue({data:{prompts:[]}});await vi.advanceTimersByTimeAsync(15000);
    expect(w.find('aside').exists()).toBe(false);w.unmount();
  });
});

it('suppresses join prompts while another tab is connected, then restores them after leaving',async()=>{
  localStorage.clear();localStorage.setItem('user','{"id":7}');localStorage.setItem('sessionId','login-one');
  mock.route=reactive({path:'/dashboard'});mock.mini=reactive({active:false});
  mock.get.mockResolvedValue({data:{prompts:[{key:'team_meeting:1',title:'Meeting',joinUrl:'/join/team-meeting/1'}]}});
  const stop=startLiveMeetingPresence();
  const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
  expect(w.find('aside').exists()).toBe(false);stop();
  window.dispatchEvent(new Event('focus'));await flushPromises();
  expect(w.find('aside').exists()).toBe(true);w.unmount();localStorage.clear();
});

it('does not poll while locked or verification failed and reloads after recovery',async()=>{mock.auth=reactive({user:{id:7}});mock.agency=reactive({currentAgency:{id:450}});mock.lock=reactive({isLocked:true,verificationFailed:false});mock.route=reactive({path:'/dashboard'});mock.mini=reactive({active:false});mock.get.mockClear();const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();expect(mock.get).not.toHaveBeenCalled();window.dispatchEvent(new Event('focus'));expect(mock.get).not.toHaveBeenCalled();mock.lock.isLocked=false;await flushPromises();expect(mock.get).toHaveBeenCalledTimes(1);mock.lock.verificationFailed=true;await flushPromises();expect(w.find('aside').exists()).toBe(false);const count=mock.get.mock.calls.length;window.dispatchEvent(new Event('focus'));await flushPromises();expect(mock.get).toHaveBeenCalledTimes(count);w.unmount();});
it('ignores a pre-lock meeting response and clears all cached meeting names',async()=>{mock.auth=reactive({user:{id:7}});mock.agency=reactive({currentAgency:{id:450}});mock.lock=reactive({isLocked:false,verificationFailed:false});mock.route=reactive({path:'/dashboard'});mock.mini=reactive({active:false});let old;mock.get.mockImplementationOnce(()=>new Promise(r=>old=r));const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();mock.lock.isLocked=true;await flushPromises();old({data:{prompts:[{key:'old',title:'Old private meeting'}]}});await flushPromises();expect(w.text()).not.toContain('Old private meeting');mock.get.mockResolvedValue({data:{prompts:[{key:'new',title:'Current meeting'}]}});mock.lock.isLocked=false;await flushPromises();expect(w.text()).toContain('Current meeting');expect(w.text()).not.toContain('Old private meeting');w.unmount();});
it('keeps actionable meeting poll errors visible without claiming invitations disappeared',async()=>{mock.auth=reactive({user:{id:7}});mock.agency=reactive({currentAgency:{id:450}});mock.lock=reactive({isLocked:false,verificationFailed:false});mock.route=reactive({path:'/dashboard'});mock.mini=reactive({active:false});mock.get.mockResolvedValueOnce({data:{prompts:[{key:'new',title:'Known meeting'}]}});const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();mock.get.mockRejectedValueOnce(new Error('unavailable'));window.dispatchEvent(new Event('focus'));await flushPromises();expect(w.text()).toContain('Known meeting');expect(w.find('[role=alert]').text()).toContain('Meeting invitations could not be checked.');w.unmount();});
