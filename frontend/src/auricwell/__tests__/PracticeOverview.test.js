import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Overview from '../PracticeOverview.vue';
let wrapper;
const note={id:'n1',patientId:'p1',data:{status:'draft',serviceDate:'2026-10-24',title:'Progress note'}};
const props={account:{id:'account-1',name:'Example Provider'},practice:{id:'practice-1',name:'Example',timezone:'America/Denver'},navigation:['schedule','clients','documentation','messages'].map(key=>({key})),notifications:[{title:'New message',section:'messages'},{title:'Restricted billing update',section:'billing'}],data:{patients:[{id:'p1',data:{name:'Example Client',status:'active'}}],notes:[note,{id:'n2',data:{status:'signed'}}],appointments:[{id:'a1',patientId:'p1',data:{start:'2026-10-24T15:00:00Z',status:'scheduled'}},{id:'a2',data:{start:'2026-10-24T15:00:00Z',status:'canceled'}}]}};
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T16:00:00Z'));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('shows real scoped clinical totals and opens the selected record',async()=>{
 wrapper=mount(Overview,{props});expect(wrapper.findAll('.ehr-metric strong').map(n=>n.text())).toEqual(['1','1','1','1']);
 expect(wrapper.text()).not.toContain('Restricted billing update');expect(wrapper.text()).not.toMatch(/Payroll|Submit|Compensation/);
 await wrapper.get('[data-tour="dash-section-ehr-notes"] .ehr-row').trigger('click');
 expect(wrapper.emitted('navigate')[0][0]).toEqual({section:'documentation',note});
});
it('retains collapse preferences in the EHR without affecting management or another practice',async()=>{
 localStorage.setItem('staff-overview-collapsed:account-1:practice-1','["work"]');
 wrapper=mount(Overview,{props});await wrapper.get('[aria-label="Collapse Pending Notes & Documentation to a summary card"]').trigger('click');
 expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').isVisible()).toBe(false);
 wrapper.unmount();wrapper=mount(Overview,{props});await flushPromises();expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').isVisible()).toBe(false);
 await wrapper.setProps({practice:{...props.practice,id:'practice-2'}});expect(wrapper.get('[data-tour="dash-section-ehr-notes"]').element.style.display).not.toBe('none');
 expect(localStorage.getItem('staff-overview-collapsed:account-1:practice-1')).toBe('["work"]');
});
it('omits unavailable clinical sections from cards, totals and customization',async()=>{
 wrapper=mount(Overview,{props:{...props,navigation:[{key:'schedule'},{key:'messages'}]}});
 expect(wrapper.find('[data-tour="dash-section-ehr-notes"]').exists()).toBe(false);expect(wrapper.find('[data-tour="dash-section-ehr-clients"]').exists()).toBe(false);
 await wrapper.get('.ov-customize').trigger('click');expect(wrapper.get('.ov-card-editor').text()).not.toContain('Pending Notes');
 expect(wrapper.get('.ov-card-editor').text()).not.toContain('Your Clients');
});
it('does not count waitlisted or discharged clients as active',()=>{
 wrapper=mount(Overview,{props:{...props,data:{...props.data,patients:[...props.data.patients,{id:'p2',data:{name:'Waiting client',status:'waitlist'}},{id:'p3',data:{name:'Former client',status:'discharged'}}]}}});
 expect(wrapper.findAll('.ehr-metric strong')[1].text()).toBe('1');
 expect(wrapper.findAll('[data-tour="dash-section-ehr-clients"] .ehr-row')).toHaveLength(1);
});
