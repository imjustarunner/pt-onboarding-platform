import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import Header from '../AppointmentHeaderFields.vue';
it('shows a linked building and room without asking the provider to choose a billing location again',()=>{
 const w=mount(Header,{props:{showLocation:true,reservationLocationLabel:'Windchime · Room 204',locationOptions:[{id:1,label:'Office'}],serviceLocationId:1},global:{stubs:{ServiceInformation:true}}});
 expect(w.text()).toContain('Windchime · Room 204');expect(w.text()).toContain('linked office reservation');expect(w.find('select[aria-label="Service location"]').exists()).toBe(false);expect(w.text()).not.toMatch(/POS\s*\d/);w.unmount();
});
it('asks for the actual client location for online sessions using plain language',()=>{
 const w=mount(Header,{props:{modality:'TELEHEALTH',showLocation:true,locationOptions:[{id:1,label:'Online — client at home'}]},global:{stubs:{ServiceInformation:true}}});
 expect(w.text()).toContain('Client location during the online session');expect(w.text()).toContain('Online — client at home');expect(w.text()).not.toContain('Office location / room');w.unmount();
});
