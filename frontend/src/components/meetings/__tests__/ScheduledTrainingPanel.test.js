// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:4}})}));
import Panel from '../ScheduledTrainingPanel.vue';
afterEach(()=>{vi.clearAllMocks();});
const data=proctor=>({event:{id:7,title:'Crisis Training',videoAllowed:false,videoDefaultOn:false,muteAll:true},proctor,assets:[],participants:[{id:1,name:'Trainer',isHost:true},{id:4,name:'Student',is_required:1}],hands:[{user_id:4,status:proctor?'raised':'denied',name:'Student'}],approvedIds:[]});
it('offers private chat to the trainer after a denied hand without exposing proctor controls',async()=>{m.get.mockResolvedValue({data:data(false)});const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();expect(w.text()).toContain('Please use private chat');expect(w.text()).not.toContain('Mute all attendees');await w.findAll('button').find(b=>b.text()==='Message Trainer').trigger('click');expect(w.emitted('private-chat')).toEqual([[1]]);w.unmount();});
it('allows proctors to approve a hand and revoke approvals by muting all',async()=>{m.get.mockResolvedValue({data:data(true)});const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Allow unmute').trigger('click');expect(m.post).toHaveBeenCalledWith('/team-meetings/7/training/hand',{action:'approve',userId:4});await w.findAll('button').find(b=>b.text()==='Mute all attendees').trigger('click');expect(m.patch).toHaveBeenCalledWith('/team-meetings/7/training',{muteAll:true});w.unmount();});
it('uses the authenticated invitation identity even if a different account is in the browser store',async()=>{
 const value=data(false);value.viewerUserId=8;value.hands=[{user_id:8,status:'approved'}];m.get.mockResolvedValue({data:value});
 const w=mount(Panel,{props:{eventId:7,live:true}});await flushPromises();expect(w.text()).toContain('Your request was approved');w.unmount();
});
it('shows the configured test reminder and requires a reason before mandatory training decline',async()=>{
 const value={...data(false),invited:true,reminderDescription:'Special schedule: 1 hour before.'};m.get.mockResolvedValue({data:value});m.post.mockResolvedValue({data:{ok:true}});
 const w=mount(Panel,{props:{eventId:7},global:{stubs:{MeetingAgendaPanel:true,MeetingGoalsActionsPanel:true}}});await flushPromises();
 expect(w.text()).toContain('Special schedule: 1 hour before.');expect(w.text()).not.toContain('24-hour reminder');
 await w.findAll('button').find(b=>b.text()==='Decline').trigger('click');const confirm=w.findAll('button').find(b=>b.text()==='Confirm decline');expect(confirm.element.disabled).toBe(true);
 await w.get('textarea').setValue('attended in the spring');await confirm.trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledWith('/team-meetings/7/training/rsvp',{response:'declined',reason:'attended in the spring'});w.unmount();
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
 expect(w.text()).toContain('RSVP: declined');expect(w.text()).toContain('Confirmed person');expect(w.text()).not.toContain('Pending person');w.unmount();
});
