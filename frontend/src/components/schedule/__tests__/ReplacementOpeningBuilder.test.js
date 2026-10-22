import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import Builder from '../ReplacementOpeningBuilder.vue';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
import api from '../../../services/api';
const slot={key:'s1',label:'January 4, 9 AM · 45 min · Virtual',modality:'VIRTUAL'};
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
async function fill(w){await w.get('input[type=date]').setValue('2030-01-04');await w.findAll('input[type=time]')[0].setValue('09:00');await w.findAll('input[type=time]')[1].setValue('12:00');await w.findAll('select')[0].setValue('45');await w.get('input[type=number]').setValue(15);}
beforeEach(()=>{vi.clearAllMocks();});
it('previews the window and lets the provider individually select its openings',async()=>{
  api.post.mockResolvedValue({data:{slots:[slot],rooms:[],unavailable:[{}]}});
  const w=mount(Builder,{props:{appointmentId:11,timeZone:'America/Denver'}});await fill(w);await button(w,'Check openings').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/appointments/11/change/replacement-options/range',{localStart:'2030-01-04T09:00',localEnd:'2030-01-04T12:00',durationMinutes:45,gapMinutes:15,modality:'VIRTUAL',roomId:null},expect.anything());
  expect(w.emitted('update:modelValue')).toBeUndefined();expect(w.text()).toContain('excluded because of calendar conflicts');
  await w.get('input[type=checkbox]').setValue(true);expect(w.emitted('update:modelValue')[0][0]).toEqual([slot]);w.unmount();
});
it('requests a room for the full window and waits for approval before offering openings',async()=>{
  const room={id:7,needsRequest:true,label:'Main office · Room 7',windowLabel:'January 4, 9–12, one time only'};
  api.post.mockResolvedValueOnce({data:{slots:[],rooms:[room],unavailable:[]}}).mockResolvedValueOnce({data:{id:88}});
  const w=mount(Builder,{props:{appointmentId:11}});await fill(w);await w.findAll('select')[1].setValue('BOTH');await button(w,'Check openings').trigger('click');await flushPromises();
  await w.findAll('select')[2].setValue(7);expect(w.emitted('update:modelValue')).toBeUndefined();
  await button(w,'Confirm and request').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/appointments/11/change/replacement-options/office-request',expect.objectContaining({localEnd:'2030-01-04T12:00',roomId:7,confirmOneTime:true}),expect.anything());
  const pending=w.emitted('update:pendingRequests')[0][0];expect(pending[0]).toMatchObject({requestId:88,appointmentId:11,roomId:7,durationMinutes:45});
  await w.setProps({pendingRequests:pending});api.post.mockResolvedValueOnce({data:{slots:[{...slot,modality:'BOTH',roomId:7}],rooms:[{...room,needsRequest:false}]}});
  await button(w,'Recheck room approval').trigger('click');await flushPromises();expect(w.findAll('input[type=checkbox]')).toHaveLength(1);w.unmount();
});
it('invalidates generated choices when the window or room changes',async()=>{
  api.post.mockResolvedValue({data:{slots:[slot],rooms:[]}});const w=mount(Builder,{props:{appointmentId:11}});await fill(w);await button(w,'Check openings').trigger('click');await flushPromises();
  await w.get('input[type=number]').setValue(30);expect(w.findAll('input[type=checkbox]')).toHaveLength(0);w.unmount();
});
it('enforces the shared 24-opening limit when selecting a whole window',async()=>{
  const selected=Array.from({length:23},(_,i)=>({key:`old-${i}`}));
  api.post.mockResolvedValue({data:{slots:[slot,{...slot,key:'s2'}],rooms:[]}});const w=mount(Builder,{props:{appointmentId:11,modelValue:selected}});await fill(w);await button(w,'Check openings').trigger('click');await flushPromises();
  await button(w,'Select available').trigger('click');expect(w.emitted('update:modelValue')[0][0]).toHaveLength(24);w.unmount();
});
