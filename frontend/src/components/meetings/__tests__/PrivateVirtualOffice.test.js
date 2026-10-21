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
  if(path==='/me/tutoring-students')return {students:[{id:40,displayName:'Demo Student'}]};
  if(path==='/me/tutoring-binder'){data.encounter.tutoring={manualBinder:true,participants:[{id:40,displayName:'Demo Student'}]};return {tutoring:data.encounter.tutoring};}
  if(path==='/me/video-token')return {sessionId:'media',token:'synthetic'};
  if(path==='/me/end'){data.encounter.state='ending';return {ok:false,state:'ending'};}
  return structuredClone(data);
 });
 const wrapper=mount(Office,{props:{request},global:{stubs:{TutorSessionGuidePanel:true,TherapySessionWorkspace:stub,OfficeDayList:true,CounselingSessionView:true}}});await flushPromises();
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
 const w=mount(Office,{props:{request},global:{stubs:{TutorSessionGuidePanel:true,TherapySessionWorkspace:stub,OfficeDayList:true,CounselingSessionView:true}}});await flushPromises();
 expect(w.text()).not.toContain('AuricWell');expect(w.text()).toContain('Learning Center');expect(w.text()).toContain('My Virtual Office');
 expect(w.classes()).not.toContain('auricwell-surface');expect(w.find('input[readonly]').element.value).toBe('https://learn.example/join/my-room/same-stable-room');
 expect(w.attributes('style')).toContain('#884499');w.unmount();
});

it('opens the admitted student binder with a deliberate identity confirmation',async()=>{
 const {wrapper,request}=await setup({state:'active',hasParticipants:true},[{id:1,guestDisplayName:'Student arrival'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();
 await button(wrapper,'Choose student').trigger('click');await flushPromises();
 await wrapper.find('.tutoring-guide select').setValue('40');
 expect(button(wrapper,'Open learning binder').attributes('disabled')).toBeDefined();
 await wrapper.find('.binder-confirm input').setValue(true);await wrapper.find('.tutoring-guide form').trigger('submit');await flushPromises();
 expect(request).toHaveBeenCalledWith('/me/tutoring-binder',{method:'POST',body:{clientId:40,visitId:1,confirmIdentity:true}});
 expect(wrapper.findComponent({name:'TutorSessionGuidePanel'}).props('clientId')).toBe(40);
 expect(wrapper.text()).toContain('Only you can see the session guide');wrapper.unmount();
});

it('offers an explicit same-session admission for a parent without ending tutoring',async()=>{
 const {wrapper,request}=await setup({state:'active',generation:3,hasParticipants:true,tutoring:{manualBinder:true,participants:[{id:40,displayName:'Student'}]}},[{id:1,guestDisplayName:'Student'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();wrapper.findComponent(stub).vm.$emit('connected');await flushPromises();
 await button(wrapper,'Admit to this tutoring session').trigger('click');await flushPromises();
 expect(wrapper.find('[role=dialog]').text()).toContain('parent or other invited participant');
 await wrapper.find('[role=dialog] select').setValue('40');expect(button(wrapper,'Confirm and admit').attributes('disabled')).toBeDefined();
 await wrapper.find('[role=dialog] input[type=checkbox]').setValue(true);await button(wrapper,'Confirm and admit').trigger('click');await flushPromises();
 expect(request).toHaveBeenCalledWith('/lobby/7/admit',{method:'POST',body:{clientId:40,confirmIdentity:true,sameEncounter:true}});
 expect(request.mock.calls.some(([p])=>p==='/me/end')).toBe(false);wrapper.unmount();
});
it('asks once when the last tutoring guest leaves and permits keeping the session open',async()=>{
 vi.useFakeTimers();const {wrapper,data,request}=await setup({state:'active',generation:3,hasParticipants:true,tutoring:{manualBinder:true,participants:[{id:40,displayName:'Student'}]}},[{id:1,guestDisplayName:'Student'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();data.admitted=[];
 await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(wrapper.find('[aria-label="End tutoring session"]').exists()).toBe(true);
 await button(wrapper,'Keep this session open').trigger('click');await vi.advanceTimersByTimeAsync(5000);await flushPromises();
 expect(wrapper.find('[aria-label="End tutoring session"]').exists()).toBe(false);expect(request.mock.calls.some(([p])=>p==='/me/end')).toBe(false);wrapper.unmount();
});
it('puts away the binder and reopens a clean office only after guest disconnection is confirmed',async()=>{
 vi.useFakeTimers();const {wrapper,data,request}=await setup({state:'active',generation:3,hasParticipants:true,tutoring:{manualBinder:true,participants:[{id:40,displayName:'Student'}]}},[{id:1,guestDisplayName:'Student'}]);
 const original=request.getMockImplementation();request.mockImplementation(async(path,options)=>{
  if(path==='/me/end'&&data.encounter.state==='ended')return {ok:true,state:'ended'};
  if(path==='/me/video-token'&&data.encounter.state==='ended'){
   data.encounter={state:'active',generation:4,hasParticipants:false,providerReady:false,tutoring:null};return {sessionId:'fresh-media',token:'synthetic'};
  }
  return original(path,options);
 });
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();const url=wrapper.find('input[readonly]').element.value;
 expect(wrapper.findComponent({name:'TutorSessionGuidePanel'}).exists()).toBe(true);
 await button(wrapper,'End tutoring session before next student').trigger('click');await button(wrapper,'Yes, end and prepare my office').trigger('click');await flushPromises();
 expect(wrapper.findComponent({name:'TutorSessionGuidePanel'}).exists()).toBe(false);
 expect(request.mock.calls.filter(([p])=>p==='/me/video-token')).toHaveLength(1);
 data.admitted=[];data.encounter.state='ended';data.encounter.tutoring=null;
 await vi.advanceTimersByTimeAsync(5000);await flushPromises();
 expect(request.mock.calls.filter(([p])=>p==='/me/video-token')).toHaveLength(2);
 expect(wrapper.findComponent(stub).exists()).toBe(true);expect(wrapper.findComponent({name:'TutorSessionGuidePanel'}).exists()).toBe(false);
 expect(wrapper.find('input[readonly]').element.value).toBe(url);expect(wrapper.text()).toContain('Second client');
 expect(request.mock.calls.some(([p])=>p.includes('/admit'))).toBe(false);wrapper.unmount();
});

it('opens a private visitor conversation without interrupting the active video or admitting them',async()=>{
 const {wrapper,request,data}=await setup({state:'active',hasParticipants:true},[{id:1,guestDisplayName:'Current student'}]);
 await button(wrapper,'Reconnect').trigger('click');await flushPromises();
 data.waiting[0].unreadMessages=1;
 await button(wrapper,'Message Second client').trigger('click');await flushPromises();
 expect(wrapper.find('.office-messages').text()).toContain('Only you and Second client');expect(request).toHaveBeenCalledWith('/me/visits/7/messages',{method:'GET'});
 expect(wrapper.findComponent(stub).exists()).toBe(true);expect(request.mock.calls.some(([p])=>p.endsWith('/admit')||p.endsWith('/end'))).toBe(false);wrapper.unmount();
});
