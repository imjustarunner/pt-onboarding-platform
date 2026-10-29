import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import {beforeEach,it,expect,vi} from 'vitest';
import View from '../MeetingTimesView.vue';
vi.mock('../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,timezone:'America/Denver'}})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
import api from '../../services/api';
const button=(w,label)=>w.findAll('button').find(b=>b.text().includes(label));
const field=(w,label)=>w.findAll('label').find(l=>l.text().startsWith(label)).find('input,select,textarea');
async function open(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});await router.push('/itsco/meeting-times');await router.isReady();const w=mount(View,{global:{plugins:[router],stubs:{MeetingReservationPicker:true}}});await flushPromises();return w;}
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async path=>({data:path.endsWith('/roster')?[{id:8,name:'Employee One',email:'one@example.test'}]:{offers:[],invitations:[]}}));});
async function fill(w){await button(w,'Create an offer').trigger('click');await field(w,'Title').setValue('Evaluation');await field(w,'Video meeting link').setValue('https://meet.example.test/room');await field(w,'From').setValue('2030-01-04T10:00');await field(w,'Until').setValue('2030-01-04T12:00');await field(w,'Reservations close at').setValue('2030-01-03T17:00');
  api.post.mockResolvedValueOnce({data:{slots:[{startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:30:00Z',available:true},{startAt:'2030-01-04T18:00:00Z',endAt:'2030-01-04T18:30:00Z',available:false}]}});await button(w,'Check openings').trigger('click');await flushPromises();await field(w,'Tag an employee').setValue(8);await button(w,'Tag employee').trigger('click');}
it('allows individual openings, employee tags and editable email recipients',async()=>{
  const w=await open();await fill(w);expect(w.text()).toContain('busy');await w.get('input[type=email]').setValue('reviewed@example.test');
  await button(w,'Add email recipient').trigger('click');expect(w.findAll('input[type=email]')).toHaveLength(2);expect(api.post.mock.calls.every(([p])=>!p.includes('publish'))).toBe(true);w.unmount();
});
it('saves a review draft and requires the commitment checkbox before publication',async()=>{
  const w=await open();await fill(w);api.post.mockImplementationOnce(async(path,body)=>({data:{id:1,title:body.title,status:'draft',revision:1,expires_at:'2030-01-04T00:00:00Z',config:{...body,slots:[{startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:30:00Z'}],recipients:[{key:'user:8',name:'Employee One',email:'one@example.test'}],editor:body},recipients:[],deliveries:[],slots:[]}}));
  await w.get('form').trigger('submit');await flushPromises();expect(api.post.mock.calls.at(-1)[0]).toBe('/meeting-reservations');expect(w.text()).toContain('Only offer times you can commit to');expect(button(w,'Publish and invite').attributes('disabled')).toBeDefined();
  await w.get('.commitment input').setValue(true);api.post.mockResolvedValueOnce({data:{id:1,title:'Evaluation',status:'open',expires_at:'2030-01-04T00:00:00Z',config:{timeZone:'America/Denver'},slots:[],recipients:[],deliveries:[]}});await button(w,'Publish and invite').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/meeting-reservations/1/publish',{revision:1,reviewed:true,commitment:true});expect(w.text()).toContain('Invitations are queued');w.unmount();
});
it('clears selected openings when a duration changes',async()=>{const w=await open();await fill(w);await field(w,'Length').setValue(60);expect(w.text()).not.toContain('Select the times to offer');expect(button(w,'Review invitations').attributes('disabled')).toBeDefined();w.unmount();});
it('shows delivery failure separately from a successful reservation',async()=>{
  api.get.mockImplementation(async path=>({data:path.endsWith('/roster')?[]:path==='/meeting-reservations'?{offers:[{id:1,title:'Evaluation',status:'open',expires_at:'2030-01-04T00:00:00Z'}],invitations:[]}:{id:1,title:'Evaluation',status:'open',expires_at:'2030-01-04T00:00:00Z',config:{timeZone:'America/Denver'},slots:[{id:10,event_id:20,status:'booked',event_status:'ACTIVE',start_at:'2030-01-04T17:00:00Z'}],recipients:[{id:30,display_name:'Employee One',email:'one@example.test',booked_at:'2030-01-02T10:00:00Z'}],deliveries:[{id:1,invitee_id:30,kind:'confirmation',status:'review',error_message:'Transport disconnected'}]}}));
  const view=await open();await button(view,'Evaluation').trigger('click');await flushPromises();expect(view.text()).toContain('Reserved');expect(view.text()).toContain('Confirmation: review');expect(view.text()).toContain('Transport disconnected');view.unmount();
});
