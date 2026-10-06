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
    expect(dates[0].find('input').element.checked).toBe(true);
    expect(dates[1].text()).toContain('No presenter assigned');
    await dates[1].findAll('input')[1].setValue(true);
    expect(wrapper.emitted('update:occurrencePresenters').at(-1)[0]).toEqual({'2026-10-19':[8]});
    await wrapper.setProps({occurrencePresenters:{'2026-10-19':[7,8]}});
    expect(dates[1].findAll('input')[2].element.disabled).toBe(true);
    await dates[1].find('button').trigger('click');
    expect(wrapper.emitted('update:occurrencePresenters').at(-1)[0]['2026-10-19']).toEqual([]);
    expect(dates[2].text()).toContain('No presenter assigned');
  });
});
