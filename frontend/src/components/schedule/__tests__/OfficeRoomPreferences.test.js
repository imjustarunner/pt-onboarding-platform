import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Header from '../AppointmentHeaderFields.vue';
const rooms=Array.from({length:8},(_,i)=>({id:i+1,roomNumber:String(i+10),label:`Office ${i+1}`,requestable:true}));
function render(extra={}){return mount(Header,{props:{officeRequestActive:true,multipleRoomPreferences:true,officeLocationId:1,officeLocations:[{id:1,name:'Windchime'}],preferredRoomOptions:rooms,...extra}});}
it('lets a provider choose up to three ranked alternatives and return to Any',async()=>{
 const w=render();let ids=[];await w.setProps({'onUpdate:preferredRoomIds':value=>{ids=value;w.setProps({preferredRoomIds:value});}});
 const choices=()=>w.findAll('.ahf-room-row .ahf-room-chip');
 await choices()[2].trigger('click');await choices()[0].trigger('click');await choices()[1].trigger('click');
 expect(ids).toEqual([3,1,2]);expect(choices()[3].element.disabled).toBe(true);expect(w.get('.ahf-preference-summary').text()).toContain('1. #12');
 await choices()[0].trigger('click');expect(ids).toEqual([3,2]);expect(choices()[3].element.disabled).toBe(false);
 await w.get('.ahf-room-list > .ahf-room-chip').trigger('click');expect(ids).toEqual([]);expect(w.text()).toContain('staff will choose one');w.unmount();
});
it('searches room numbers and names without clearing chosen preferences',async()=>{
 const w=render({preferredRoomIds:[3]});await w.get('[aria-label="Search room preferences"]').setValue('17');expect(w.findAll('.ahf-room-row')).toHaveLength(1);expect(w.text()).toContain('1. #12');w.unmount();
});
it('keeps the single-room editor for actions that need one actual room',async()=>{
 const w=render({multipleRoomPreferences:false});await w.findAll('.ahf-room-row .ahf-room-chip')[1].trigger('click');expect(w.emitted('update:preferredRoomId')).toEqual([[2]]);expect(w.emitted('update:preferredRoomIds')).toBeUndefined();w.unmount();
});
