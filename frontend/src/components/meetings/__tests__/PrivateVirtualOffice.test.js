import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
import Office from '../PrivateVirtualOffice.vue';
const stub={name:'TherapySessionWorkspace',template:'<div />'};
afterEach(()=>vi.useRealTimers());
async function setup(encounter,admitted=[]){
 const data={waiting:[{id:7,guestDisplayName:'Second client'}],admitted,encounter:{providerReady:true,...encounter}};
 const request=vi.fn(async(path,options)=>{
  if(path==='/me/plan')return {plan:{privateOffice:true,multipleOfficeGuests:true}};
  if(path==='/me')return {room:{slug:'synthetic',branding:{agencyName:'Practice',officeProduct:'auricwell',officeOrigin:'https://auricwell.com'}}};
  if(path==='/me/video-token')return {sessionId:'media',token:'synthetic'};
  if(path==='/me/end'){data.encounter.state='ending';return {ok:false,state:'ending'};}
  return structuredClone(data);
 });
 const wrapper=mount(Office,{props:{request},global:{stubs:{TherapySessionWorkspace:stub,OfficeDayList:true,CounselingSessionView:true}}});await flushPromises();
 return {wrapper,request,data};
}
const button=(wrapper,text)=>wrapper.findAll('button').find(b=>b.text().includes(text));
it('uses the AuricWell guest URL regardless of the provider dashboard hostname',async()=>{
 const {wrapper}=await setup({state:'idle',hasParticipants:false});
 expect(wrapper.find('input[readonly]').element.value).toBe('https://auricwell.com/join/my-room/synthetic');
 wrapper.unmount();
});
it('keeps replacement admission locked when the prior client has left',async()=>{
 const {wrapper}=await setup({state:'active',hasParticipants:true},[]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 expect(button(wrapper,'Start session').attributes('disabled')).toBeDefined();
 expect(button(wrapper,'Add to this')).toBeUndefined();expect(wrapper.text()).toContain('until you end it');wrapper.unmount();
});
it('requires explicit confirmation before adding an intended couples participant',async()=>{
 const {wrapper,request}=await setup({state:'active',hasParticipants:true},[{id:1,guestDisplayName:'First client'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 await button(wrapper,'Add to this couples').trigger('click');await flushPromises();
 expect(request.mock.calls.some(([path])=>path.includes('/admit'))).toBe(false);
 expect(wrapper.find('[role=dialog]').text()).toContain('They will see its shared content');
 await button(wrapper,'Add to current session').trigger('click');await flushPromises();expect(request).toHaveBeenCalledWith('/lobby/7/admit',{method:'POST',body:{sameEncounter:true}});wrapper.unmount();
});
it('shows pending disconnection and prevents reopening until the server confirms completion',async()=>{
 vi.useFakeTimers();const {wrapper,data}=await setup({state:'active',hasParticipants:true});
 await button(wrapper,'End session for everyone').trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('disconnecting everyone');expect(button(wrapper,'Open office video').attributes('disabled')).toBeDefined();
 data.encounter.state='ended';await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(button(wrapper,'Open office video').attributes('disabled')).toBeUndefined();wrapper.unmount();
});

it('does not enable admission until the server confirms the provider connection',async()=>{
 vi.useFakeTimers();const {wrapper,data,request}=await setup({state:'active',hasParticipants:false,providerReady:false});
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 expect(button(wrapper,'Start session').attributes('disabled')).toBeDefined();
 expect(wrapper.text()).toContain('Confirming your video connection');
 data.encounter.providerReady=true;await vi.advanceTimersByTimeAsync(5000);await flushPromises();
 expect(button(wrapper,'Start session').attributes('disabled')).toBeUndefined();
 await button(wrapper,'Start session').trigger('click');await flushPromises();
 expect(request).toHaveBeenCalledWith('/lobby/7/admit',{method:'POST',body:{sameEncounter:false}});wrapper.unmount();
});

it('groups shared IP addresses without combining client visits or durations',async()=>{
 const {wrapper,data}=await setup({state:'idle',hasParticipants:false});
 data.visits=[{id:1,displayName:'Client A',ipAddress:'192.0.2.1',entryMethod:'invitation',durationSeconds:60},{id:2,displayName:'Client B',ipAddress:'192.0.2.1',entryMethod:'office_link',durationSeconds:120},{id:3,displayName:'Client C',ipAddress:'192.0.2.2',durationSeconds:30}];
 const details=wrapper.find('details');details.element.open=true;await details.trigger('toggle');await flushPromises();
 await wrapper.find('.history-grouping select').setValue('ip');
 expect(wrapper.findAll('tbody')).toHaveLength(2);expect(wrapper.findAll('tbody')[0].findAll('td')).toHaveLength(18);
 expect(wrapper.findAll('tbody')[0].text()).toContain('Client A');expect(wrapper.findAll('tbody')[0].text()).toContain('Client B');expect(wrapper.findAll('tbody')[0].text()).toContain('1m 0s');expect(wrapper.findAll('tbody')[0].text()).toContain('2m 0s');expect(wrapper.findAll('tbody')[0].text()).toContain('Personal invitation');
 wrapper.unmount();
});

it('loads an existing full meeting beside the office waiting room',async()=>{
 const {wrapper}=await setup({state:'idle',hasParticipants:false});
 wrapper.findComponent({name:'OfficeDayList'}).vm.$emit('open',{key:'meeting',type:'meeting',title:'Team meeting',url:'https://auricwell.com/join/team-meeting/synthetic'});await flushPromises();
 expect(wrapper.find('iframe').attributes('src')).toBe('/join/team-meeting/synthetic');expect(wrapper.find('aside').text()).toContain('Second client');
 await button(wrapper,'Return to office').trigger('click');expect(wrapper.find('iframe').exists()).toBe(false);wrapper.unmount();
});
it('requires identity confirmation before assigning an office guest to an appointment',async()=>{
 const {wrapper,request}=await setup({state:'active',hasParticipants:false,scheduled:{id:9,participants:[{id:10,displayName:'Scheduled client'}]}});
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent({name:'CounselingSessionView'}).vm.$emit('connected');await flushPromises();
 await button(wrapper,'Identify and admit').trigger('click');await flushPromises();expect(request.mock.calls.some(([p])=>p.includes('/admit'))).toBe(false);
 expect(button(wrapper,'Confirm and admit').attributes('disabled')).toBeDefined();await wrapper.find('[role=dialog] select').setValue('10');await button(wrapper,'Confirm and admit').trigger('click');await flushPromises();
 expect(request).toHaveBeenCalledWith('/lobby/7/admit',{method:'POST',body:{clientId:10,confirmIdentity:true,sameEncounter:false}});wrapper.unmount();
});

it('keeps a non-EHR office on its tenant brand and stable guest link',async()=>{
 const request=vi.fn(async path=>path==='/me'?{room:{slug:'same-stable-room',branding:{officeProduct:'tenant',officeOrigin:'https://learn.example',agencyName:'Learning Center',agencyLogoUrl:'/learning.svg',colorPalette:{primary:'#884499'}}}}:path==='/me/plan'?{plan:{privateOffice:true}}:{waiting:[],admitted:[],encounter:{state:'idle'}});
 const w=mount(Office,{props:{request},global:{stubs:{TherapySessionWorkspace:stub,OfficeDayList:true,CounselingSessionView:true}}});await flushPromises();
 expect(w.text()).not.toContain('AuricWell');expect(w.text()).toContain('Learning Center');expect(w.text()).toContain('My Virtual Office');
 expect(w.classes()).not.toContain('auricwell-surface');expect(w.find('input[readonly]').element.value).toBe('https://learn.example/join/my-room/same-stable-room');
 expect(w.attributes('style')).toContain('#884499');w.unmount();
});
