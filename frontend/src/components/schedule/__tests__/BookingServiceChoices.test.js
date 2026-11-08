import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Header from '../AppointmentHeaderFields.vue';
it('reveals additional eligible services while retaining the selected service and its duration',async()=>{
 const wrapper=mount(Header,{props:{showPrimaryServiceCode:true,primaryServiceCode:'90837',primaryServiceCodeOptions:[{code:'90837',defaultDurationMinutes:60},{code:'90832',defaultDurationMinutes:30},{code:'90834',defaultDurationMinutes:45},{code:'CUSTOM',defaultDurationMinutes:75}]},global:{stubs:{ServiceInformation:true}}});
 const select=()=>wrapper.get('select[aria-label="Service code"]');
 expect(select().findAll('option').map(o=>o.attributes('value'))).toEqual(['','90837']);
 await wrapper.get('.ahf-more-services').trigger('click');expect(wrapper.get('.ahf-more-services').attributes('aria-expanded')).toBe('true');
 await select().setValue('90832');expect(wrapper.emitted('update:primaryServiceCode').at(-1)).toEqual(['90832']);
 await wrapper.setProps({primaryServiceCode:'90832'});await wrapper.get('.ahf-more-services').trigger('click');expect(select().findAll('option').map(o=>o.attributes('value'))).toContain('90832');expect(wrapper.text()).toContain('Default booking duration: 30 minutes');wrapper.unmount();
});
