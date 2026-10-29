import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import {beforeEach,it,expect,vi} from 'vitest';
import Picker from '../MeetingReservationPicker.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
const invitation=()=>({title:'Evaluation',name:'Employee One',employee:true,timeZone:'America/Denver',modality:'BOTH',location:'Office 1',expiresAt:'2030-01-03T17:00:00Z',closed:false,booking:null,slots:[{id:10,startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:45:00Z'}]});
const booking=status=>({eventId:20,title:'Evaluation',status,startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:45:00Z',location:'Office 1',meetingUrl:'https://meet.example.test/current'});
const button=(w,label)=>w.findAll('button').find(b=>b.text().includes(label));
async function open(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});await router.push('/meeting-times?invitation=30');await router.isReady();const w=mount(Picker,{props:{endpoint:'/meeting-reservations/invitations/30'},global:{plugins:[router]}});await flushPromises();return w;}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:invitation()});});
it('requires the offered format and time, then displays the confirmed appointment without approval',async()=>{
  const w=await open();expect(button(w,'Reserve this time').attributes('disabled')).toBeDefined();await w.get('select').setValue('IN_PERSON');await w.get('input[type=radio]').setValue();
  api.post.mockResolvedValue({data:{...invitation(),booking:booking('ACTIVE')}});await w.get('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/meeting-reservations/invitations/30/claim',{slotId:10,modality:'IN_PERSON'},{skipAuthRedirect:true});
  expect(w.text()).toContain('Your time has been reserved');expect(w.text()).not.toContain('approval');expect(w.find('input[type=radio]').exists()).toBe(false);expect(w.findAll('a').some(a=>a.attributes('href').includes('eventId=20'))).toBe(true);expect(w.emitted('reserved')).toHaveLength(1);w.unmount();
});
it('requires sign-in for a tagged employee link without displaying openings',async()=>{
  api.get.mockRejectedValue({response:{status:401,data:{error:{message:'Sign in with the employee account that received this invitation.'}}}});const w=await open();expect(w.text()).toContain('Sign in');expect(w.find('form').exists()).toBe(false);expect(w.get('a').attributes('href')).toContain('/login?redirect=');w.unmount();
});
it('shows a taken-slot error and allows a fresh availability check',async()=>{
  const w=await open();await w.get('select').setValue('VIRTUAL');await w.get('input[type=radio]').setValue();api.post.mockRejectedValue({response:{status:409,data:{error:{message:'That time is no longer available.'}}}});await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toContain('no longer available');expect(button(w,'Reserve this time').attributes('disabled')).toBeDefined();
  api.get.mockResolvedValue({data:{...invitation(),slots:[]}});await button(w,'Refresh availability').trigger('click');await flushPromises();expect(w.text()).toContain('All offered times');w.unmount();
});
it('shows no claim action for an expired invitation',async()=>{api.get.mockResolvedValue({data:{...invitation(),closed:true,slots:[]}});const w=await open();expect(w.text()).toContain('expired or closed');expect(w.find('form').exists()).toBe(false);w.unmount();});
it('keeps reserved meetings visible after the offer closes',async()=>{api.get.mockResolvedValue({data:{...invitation(),closed:true,booking:booking('ACTIVE')}});const w=await open();expect(w.text()).toContain('Your time has been reserved');expect(w.text()).not.toContain('expired');expect(w.find('a[target=_blank]').attributes('href')).toBe('https://meet.example.test/current');w.unmount();});
it('removes join and calendar actions when the actual meeting is canceled',async()=>{api.get.mockResolvedValue({data:{...invitation(),booking:booking('CANCELLED')}});const w=await open();expect(w.text()).toContain('has been canceled');expect(w.text()).not.toContain('Add to calendar');expect(w.find('a[target=_blank]').exists()).toBe(false);w.unmount();});
