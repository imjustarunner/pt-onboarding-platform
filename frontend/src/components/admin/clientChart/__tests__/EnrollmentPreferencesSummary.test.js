import { expect,it } from 'vitest';
import { mount } from '@vue/test-utils';
import EnrollmentPreferencesSummary from '../EnrollmentPreferencesSummary.vue';
it('shows the staff provider and dated time request without claiming a booking or exposing private answers',()=>{
 const preferences={providerSelection:{providerId:1433,providerName:'Avery Morgan QA',modality:'VIRTUAL',status:'REQUESTED'},requestedOpening:{startAt:'2026-10-29T20:00:00Z',endAt:'2026-10-29T21:00:00Z',timeZone:'America/Denver',frequency:'WEEKLY'},privateAnswer:'do not show'};
 const wrapper=mount(EnrollmentPreferencesSummary,{props:{preferences:JSON.stringify(preferences)}});
 expect(wrapper.text()).toContain('Avery Morgan QA');expect(wrapper.text()).toContain('2:00 PM – 3:00 PM');expect(wrapper.text()).toContain('America/Denver');
 expect(wrapper.text()).toContain('not a confirmed appointment');expect(wrapper.text()).not.toContain('do not show');
});
it('hides absent or malformed preferences and clears the previous client on change',async()=>{
 const wrapper=mount(EnrollmentPreferencesSummary,{props:{preferences:{providerSelection:{providerId:1,providerName:'Previous'}}}});
 await wrapper.setProps({preferences:null});expect(wrapper.find('section').exists()).toBe(false);
 await wrapper.setProps({preferences:'{invalid'});expect(wrapper.find('section').exists()).toBe(false);
});
