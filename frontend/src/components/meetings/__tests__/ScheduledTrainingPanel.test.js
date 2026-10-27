// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:4}})}));
import Panel from '../ScheduledTrainingPanel.vue';
afterEach(()=>{vi.clearAllMocks();});
const data=proctor=>({event:{id:7,title:'Crisis Training',videoAllowed:false,videoDefaultOn:false,muteAll:true},proctor,assets:[],participants:[{id:1,name:'Trainer',isHost:true},{id:4,name:'Student',is_required:1}],hands:[{user_id:4,status:proctor?'raised':'denied',name:'Student'}],approvedIds:[]});
it('offers private chat to the trainer after a denied hand without exposing proctor controls',async()=>{m.get.mockResolvedValue({data:data(false)});const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();expect(w.text()).toContain('Please use private chat');expect(w.text()).not.toContain('Mute all attendees');await w.findAll('button').find(b=>b.text()==='Message Trainer').trigger('click');expect(w.emitted('private-chat')).toEqual([[1]]);w.unmount();});
it('allows proctors to approve a hand and revoke approvals by muting all',async()=>{m.get.mockResolvedValue({data:data(true)});const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Allow unmute').trigger('click');expect(m.post).toHaveBeenCalledWith('/team-meetings/7/training/hand',{action:'approve',userId:4});await w.findAll('button').find(b=>b.text()==='Mute all attendees').trigger('click');expect(m.patch).toHaveBeenCalledWith('/team-meetings/7/training',{muteAll:true},{skipGlobalLoading:true,timeout:10000});w.unmount();});
it('uses the authenticated invitation identity even if a different account is in the browser store',async()=>{
 const value=data(false);value.viewerUserId=8;value.hands=[{user_id:8,status:'approved'}];m.get.mockResolvedValue({data:value});
 const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();expect(w.text()).toContain('Your request was approved');w.unmount();
});
it('shows the configured test reminder and requires a reason before mandatory training decline',async()=>{
 const value={...data(false),invited:true,reminderDescription:'Special schedule: 1 hour before.'};m.get.mockResolvedValue({data:value});m.post.mockResolvedValue({data:{ok:true}});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 expect(w.text()).toContain('Special schedule: 1 hour before.');expect(w.text()).not.toContain('24-hour reminder');
 await w.findAll('button').find(b=>b.text()==='Decline').trigger('click');const confirm=w.findAll('button').find(b=>b.text()==='Confirm decline');expect(confirm.element.disabled).toBe(true);
 await w.get('textarea').setValue('attended in the spring');await w.get('form').trigger('submit');await flushPromises();expect(m.post).toHaveBeenCalledWith('/team-meetings/7/training/rsvp',{response:'declined',reason:'attended in the spring'});w.unmount();
});
it('lets optional staff register from agency-visible training and dismiss without a reason',async()=>{
 const value={...data(false),invited:false,canRegister:true,viewerInvitation:{id:4,is_required:0,rsvp:'pending'}};m.get.mockResolvedValue({data:value});m.post.mockResolvedValue({data:{ok:true}});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Decline and stop reminders').trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/team-meetings/7/training/rsvp',{response:'declined',reason:''});expect(w.find('textarea').exists()).toBe(false);expect(w.emitted('rsvp-saved')).toHaveLength(1);w.unmount();
});
it('shows confirmed attendees to everyone and uses separate own response after a decline',async()=>{
 const value={...data(false),invited:true,viewerInvitation:{id:4,is_required:0,rsvp:'declined'},participants:[{id:1,name:'Trainer',isHost:true,rsvp:'pending'},{id:9,name:'Confirmed person',rsvp:'accepted'},{id:10,name:'Pending person',rsvp:'pending'}]};m.get.mockResolvedValue({data:value});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 expect(w.text()).toContain('Your response: Not attending');await w.findAll('button').find(b=>b.text()==='RSVP').trigger('click');expect(w.text()).toContain('Confirmed person');expect(w.text()).not.toContain('Pending person');w.unmount();
});

it('shows colored RSVP totals and authorized decline reasons in the event record',async()=>{
 const value={...data(true),invited:true,canSeeDeclined:true,participants:[{id:1,name:'Trainer',isHost:true,rsvp:'accepted'},{id:4,name:'Student',rsvp:'declined',rsvp_decline_reason:'Attended in spring'},{id:5,name:'Pending',rsvp:'pending'}]};m.get.mockResolvedValue({data:value});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true,MeetingAttendancePanel:true,MeetingNotesPanel:true}}});await flushPromises();
 expect(w.get('.rsvp-status--declined').text()).toContain('1');await w.findAll('button').find(b=>b.text()==='RSVP').trigger('click');expect(w.text()).toContain('Attended in spring');expect(w.find('.rsvp-status--pending').exists()).toBe(true);w.unmount();
});

it('keeps the decline form and reason on a failed save, then displays the saved decline',async()=>{
 const value={...data(false),invited:true,viewerInvitation:{id:4,is_required:1,rsvp:'accepted'}};
 m.get.mockResolvedValue({data:value});m.post.mockRejectedValueOnce({response:{data:{error:{message:'Please try again'}}}});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Decline').trigger('click');
 await w.get('textarea').setValue('  Already attended  ');await w.get('form').trigger('submit');await flushPromises();
 expect(w.get('textarea').element.value).toBe('  Already attended  ');expect(w.get('[role=alert]').text()).toBe('Please try again');expect(w.text()).toContain('Your response: Attending');
 m.post.mockResolvedValueOnce({data:{ok:true,response:'declined'}});
 m.get.mockResolvedValueOnce({data:{...value,viewerInvitation:{...value.viewerInvitation,rsvp:'declined',rsvp_decline_reason:'Already attended'}}});
 await w.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenLastCalledWith('/team-meetings/7/training/rsvp',{response:'declined',reason:'Already attended'});
 expect(w.find('form').exists()).toBe(false);expect(w.text()).toContain('Your response: Not attending');expect(w.text()).toContain('Reason: Already attended');
 await w.findAll('button').find(b=>b.text()==='Decline').trigger('click');expect(w.get('textarea').element.value).toBe('Already attended');
 await w.findAll('button').find(b=>b.text()==='Cancel').trigger('click');expect(w.text()).toContain('Your response: Not attending');w.unmount();
});
it('prevents a second RSVP while saving a decline',async()=>{
 const value={...data(false),invited:true};m.get.mockResolvedValue({data:value});let finish;m.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Decline').trigger('click');await w.get('textarea').setValue('Unavailable');
 await w.get('form').trigger('submit');await w.get('form').trigger('submit');expect(m.post).toHaveBeenCalledTimes(1);expect(w.get('textarea').element.disabled).toBe(true);expect(w.text()).not.toContain('I’m attending');
 finish({data:{ok:true}});await flushPromises();w.unmount();
});

it('confirms camera permission without hiding the meeting while the follow-up refresh is slow',async()=>{
 const value=data(true);m.get.mockResolvedValueOnce({data:value});m.patch.mockResolvedValue({data:{ok:true}});
 const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();
 let finish;m.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await w.get('input[type=checkbox]').setValue(true);await flushPromises();
 expect(m.patch).toHaveBeenCalledWith('/team-meetings/7/training',{videoAllowed:true},{skipGlobalLoading:true,timeout:10000});
 expect(w.emitted('state').at(-1)[0].event.videoAllowed).toBe(true);
 expect(w.get('input[type=checkbox]').element.checked).toBe(true);
 expect(w.get('input[type=checkbox]').element.disabled).toBe(true);
 finish({data:{...value,event:{...value.event,videoAllowed:true}}});await flushPromises();
 expect(w.get('input[type=checkbox]').element.disabled).toBe(false);w.unmount();
});

it('ignores an old poll that finishes after the trainer enables cameras',async()=>{
 const value=data(true);m.get.mockResolvedValueOnce({data:value});m.patch.mockResolvedValue({data:{ok:true}});
 const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();
 let finishOld;m.get.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;}));
 const pending=w.vm.load();await flushPromises();
 m.get.mockResolvedValueOnce({data:{...value,event:{...value.event,videoAllowed:true}}});
 await w.get('input[type=checkbox]').setValue(true);await flushPromises();
 const savedCount=w.emitted('state').length;
 finishOld({data:value});await pending;await flushPromises();
 expect(w.emitted('state').slice(savedCount).every(([state])=>state.event.videoAllowed)).toBe(true);
 expect(w.get('input[type=checkbox]').element.checked).toBe(true);w.unmount();
});
