import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import Header from '../AppointmentHeaderFields.vue';
it('shows a linked building and room without asking the provider to choose a billing location again',()=>{
 const w=mount(Header,{props:{showLocation:true,reservationLocationLabel:'Windchime · Room 204',locationOptions:[{id:1,label:'Office'}],serviceLocationId:1},global:{stubs:{ServiceInformation:true}}});
 expect(w.text()).toContain('Windchime · Room 204');expect(w.text()).toContain('linked office reservation');expect(w.find('fieldset.location-picker').exists()).toBe(false);expect(w.text()).not.toMatch(/POS\s*\d/);w.unmount();
});
it('asks for the actual client location with app controls',async()=>{
 const w=mount(Header,{props:{modality:'TELEHEALTH',showLocation:true,locationOptions:[{id:1,label:'Online — client at home',placeOfService:'10'},{id:2,label:'Online — client away from home',placeOfService:'02'}]},global:{stubs:{ServiceInformation:true}}});
 expect(w.text()).toContain('Where will the client be?');
 const choices=w.findAll('.location-picker input[type="radio"]');
 expect(choices).toHaveLength(2);
 await choices[1].setValue();
 expect(w.emitted('update:serviceLocationId')).toEqual([[2]]);
 w.unmount();
});
