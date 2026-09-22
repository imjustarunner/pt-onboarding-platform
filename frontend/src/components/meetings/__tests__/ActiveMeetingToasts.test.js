import {flushPromises,mount} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import ActiveMeetingToasts from '../ActiveMeetingToasts.vue';
const mock=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),route:{},mini:{}}));
vi.mock('../../../services/api',()=>({default:{get:mock.get}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:mock.push}),useRoute:()=>mock.route}));
vi.mock('../../../composables/useActiveMeeting',()=>({useActiveMeeting:()=>({state:mock.mini})}));
describe('active meeting notices',()=>{
  beforeEach(()=>{
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
    mock.mini.active=false;await flushPromises();expect(w.text()).toContain('Supervision');w.unmount();
    const count=mock.get.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(mock.get).toHaveBeenCalledTimes(count);
  });
  it('keeps dismissals after remount and isolates them by account',async()=>{
    let w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();await w.get('[aria-label="Dismiss Leadership for this meeting"]').trigger('click');w.unmount();
    w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();expect(w.text()).not.toContain('Leadership');await w.setProps({userId:8});await flushPromises();expect(w.text()).toContain('Leadership');w.unmount();
  });
  it('clears ended meetings on the next poll',async()=>{
    const w=mount(ActiveMeetingToasts,{props:{userId:7}});await flushPromises();
    mock.get.mockResolvedValue({data:{prompts:[]}});await vi.advanceTimersByTimeAsync(15000);
    expect(w.find('aside').exists()).toBe(false);w.unmount();
  });
});
