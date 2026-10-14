import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import SupervisionBody from '../SupervisionBody.vue';
describe('date-specific group supervision presenters', () => {
  it('shows every date, permits none or two, and never carries a first-date choice into later dates', async () => {
    const wrapper = mount(SupervisionBody, { props: {
      section:'details', groupMode:true, presenterIds:[7],
      presenterOptions:[{id:7,label:'First presenter'},{id:8,label:'Second presenter'},{id:9,label:'Third presenter'}],
      occurrenceDates:['2026-10-12','2026-10-19','2026-10-26'], occurrencePresenters:{}
    }});
    const dates = wrapper.findAll('fieldset.supb-occurrence'); expect(dates).toHaveLength(3);
    expect(dates[0].find('.supb-presenter-picker input').element.checked).toBe(true);
    expect(dates[1].text()).toContain('No presenter assigned');
    await dates[1].findAll('.supb-presenter-picker input')[1].setValue(true);
    expect(wrapper.emitted('update:occurrencePresenters').at(-1)[0]).toEqual({'2026-10-19':[8]});
    await wrapper.setProps({occurrencePresenters:{'2026-10-19':[7,8]}});
    expect(dates[1].findAll('.supb-presenter-picker input')[2].element.disabled).toBe(true);
    await dates[1].find('button').trigger('click');
    expect(wrapper.emitted('update:occurrencePresenters').at(-1)[0]['2026-10-19']).toEqual([]);
    expect(dates[2].text()).toContain('No presenter assigned');
  });
});

it('searches each date separately and collects a cancellation reason inline', async () => {
 const wrapper=mount(SupervisionBody,{props:{section:'details',groupMode:true,presenterOptions:[{id:7,label:'Rachel Finch'},{id:8,label:'Michael Mendez'}],occurrenceDates:['2026-11-26','2026-12-03']}});
 await wrapper.find('[aria-label="Search presenters for 2026-11-26"]').setValue('mendez');
 expect(wrapper.findAll('fieldset')[0].findAll('.supb-presenter-option')).toHaveLength(1);
 expect(wrapper.findAll('fieldset')[1].findAll('.supb-presenter-option')).toHaveLength(2);
 await wrapper.findAll('fieldset')[0].find('input[type="checkbox"]').setValue(true);
 expect(wrapper.emitted('update:occurrenceCancellations').at(-1)[0]).toEqual({'2026-11-26':''});
 await wrapper.setProps({occurrenceCancellations:{'2026-11-26':''}});
 await wrapper.find('[aria-label="Cancellation reason for 2026-11-26"]').setValue('Thanksgiving week');
 expect(wrapper.emitted('update:occurrenceCancellations').at(-1)[0]).toEqual({'2026-11-26':'Thanksgiving week'});
 expect(wrapper.findAll('fieldset')[0].find('.supb-presenter-picker').exists()).toBe(false);
 wrapper.unmount();
});
