import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import OfficeDayList from '../OfficeDayList.vue';
import {officeMeetingTarget,agendaMeeting} from '../../../utils/officeAgenda';
const state=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:state.get}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:5}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'Practice A'},userAgencies:[{id:2,name:'Practice A'},{id:3,name:'Practice B'},{id:445,name:'Unavailable agency'}]})}));
beforeEach(()=>{state.get.mockReset();});afterEach(()=>vi.useRealTimers());
it('shows agency brands, meeting colors, and expandable full-meeting launch controls',async()=>{
 const start=new Date().toISOString(),end=new Date(Date.now()+3600000).toISOString();
 state.get.mockImplementation(async(url,{params})=>({data:url.endsWith('/schedule-scopes')?{agencyIds:[2,3]}:url.includes('schedule-summary')?{scheduleEvents:[{id:4,agencyId:2,kind:'TEAM_MEETING',title:'Team check-in',startAt:start,endAt:end,appJoinUrl:'/join/team-meeting/guest',isHost:true,hostJoinUrl:'/join/team-meeting/host'}]}:{branding:{agencyName:`Practice ${params.agencyId}`,agencyLogoUrl:`/brand-${params.agencyId}.svg`},items:[{key:'appointment-1',appointmentId:params.agencyId,title:'Counseling',kind:'mental_health',canOpen:true,startAt:start,endAt:end}]}}));
 const w=mount(OfficeDayList,{props:{agencyId:2}});await flushPromises();
 expect(state.get.mock.calls.some(([url,config])=>url.endsWith('/schedule')&&config.params.agencyId===445)).toBe(false);expect(w.find('[role=alert]').exists()).toBe(false);
 expect(w.findAll('.agenda-item')).toHaveLength(3);expect(w.find('img').attributes('src')).toBe('/brand-2.svg');
 const full=w.findAll('button').find(b=>b.text()==='Open full meeting');await full.trigger('click');expect(w.emitted('open')[0][0].url).toBe('/join/team-meeting/host');
 await w.find('select').setValue('3');expect(w.findAll('.agenda-item')).toHaveLength(1);expect(w.text()).toContain('Practice 3');
 await w.setProps({locked:true});expect(w.find('.agenda-details button').attributes('disabled')).toBeDefined();w.unmount();
});
it('embeds known full room routes on the current origin and rejects executable URLs',()=>{
 for(const path of ['/itsco/join/team-meeting/abc','/join/supervision/abc','/tutoring-session/123'])expect(officeMeetingTarget('https://auricwell.com'+path,'https://plottwisthq.com')).toEqual({embedded:true,path});
 expect(officeMeetingTarget('javascript:alert(1)')).toBeNull();expect(officeMeetingTarget('https://example.com/join/team-meeting/abc')).toEqual({embedded:false,path:'https://example.com/join/team-meeting/abc'});
 expect(officeMeetingTarget('https://auricwell.com/account-security').embedded).toBe(false);
});
it('preserves host links and excludes canceled meetings',()=>{
 const event={kind:'TEAM_MEETING',id:1,startAt:'2026-10-13 15:00:00',endAt:'2026-10-13 16:00:00',isHost:true,hostJoinUrl:'/join/team-meeting/host',appJoinUrl:'/join/team-meeting/guest'};
 expect(agendaMeeting(event).url).toBe(event.hostJoinUrl);expect(agendaMeeting({...event,isHost:false}).url).toBe(event.appJoinUrl);expect(agendaMeeting({...event,status:'CANCELLED'})).toBeNull();
});

it('only includes virtual sessions even when an in-person event retains video links',()=>{
 const event={id:1,kind:'SUPERVISION',startAt:'2026-10-13 15:00:00',endAt:'2026-10-13 16:00:00',appJoinUrl:'/join/supervision/guest'};
 for(const modality of ['in_person','IN-PERSON','PHONE','unknown',''])expect(agendaMeeting({...event,modality})).toBeNull();
 for(const modality of ['virtual','TELEHEALTH','VIDEO'])expect(agendaMeeting({...event,modality})).not.toBeNull();
 expect(agendaMeeting({...event,kind:'TEAM_MEETING',modality:'IN_PERSON'})).toBeNull();
 expect(agendaMeeting({...event,kind:'TEAM_MEETING'})).not.toBeNull();
 expect(agendaMeeting({...event,kind:'PERSONAL_EVENT'})).toBeNull();
 expect(agendaMeeting({...event,modality:'VIRTUAL',deliveryContext:'in_person'})).toBeNull();
});

it('refreshes allowed agencies and stops polling a tenant after access is removed',async()=>{
 vi.useFakeTimers();let allowed=[2,3];
 state.get.mockImplementation(async(url)=>({data:url.endsWith('/schedule-scopes')?{agencyIds:allowed}:url.includes('schedule-summary')?{scheduleEvents:[]}:{items:[]}}));
 const w=mount(OfficeDayList,{props:{agencyId:2}});await flushPromises();
 expect(w.find('option[value="3"]').exists()).toBe(true);await w.find('select').setValue('3');allowed=[2];state.get.mockClear();
 await vi.advanceTimersByTimeAsync(15000);await flushPromises();
 expect(state.get.mock.calls.filter(([url])=>url.endsWith('/schedule')).map(([,config])=>config.params.agencyId)).toEqual([2]);
 expect(w.find('select').element.value).toBe('');expect(w.find('option[value="3"]').exists()).toBe(false);expect(w.find('[role=alert]').exists()).toBe(false);w.unmount();
});
it.each(['schedule-scopes','schedule'])('keeps real %s errors visible and preserves loaded meetings',async failing=>{
 const start=new Date().toISOString(),end=new Date(Date.now()+3600000).toISOString();
 state.get.mockImplementation(async(url)=>{
  if(url.endsWith('/'+failing))throw {response:{status:500}};
  return {data:url.endsWith('/schedule-scopes')?{agencyIds:[2]}:url.includes('schedule-summary')?{scheduleEvents:[{id:9,kind:'TEAM_MEETING',title:'Available meeting',startAt:start,endAt:end,appJoinUrl:'/join/team-meeting/abc'}]}:{items:[]}};
 });
 const w=mount(OfficeDayList,{props:{agencyId:2}});await flushPromises();
 expect(w.find('[role=alert]').text()).toContain('Some of your schedule could not be loaded');expect(w.text()).toContain('Available meeting');w.unmount();
});
