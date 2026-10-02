import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import TeamMeetingBody from '../TeamMeetingBody.vue';
import SupervisionBody from '../SupervisionBody.vue';
describe.each([['team meetings',TeamMeetingBody]])('%s reminder editor',(_,component)=>{
  it('defaults to five minutes and lets the host choose another time or none',async()=>{
    const wrapper=mount(component);
    const select=wrapper.get('select[aria-label="App reminder"]');
    expect(select.element.value).toBe('5');
    await select.setValue('30');expect(wrapper.emitted('update:reminderMinutes')[0]).toEqual([30]);
    await select.setValue('off');expect(wrapper.emitted('update:reminderMinutes')[1]).toEqual([null]);
    wrapper.unmount();
  });
  it('restores saved settings when editing and respects notification opt-out',async()=>{
    const wrapper=mount(component,{props:{reminderMinutes:1440}});
    expect(wrapper.get('select[aria-label="App reminder"]').element.value).toBe('1440');
    await wrapper.setProps({reminderMinutes:null});expect(wrapper.get('select[aria-label="App reminder"]').element.value).toBe('off');
    await wrapper.setProps({notifyParticipants:false});expect(wrapper.find('select[aria-label="App reminder"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('multiple supervision reminders',()=>{
  it('keeps five minutes while adding another reminder and restores the selection',async()=>{
    const w=mount(SupervisionBody,{props:{reminderOffsets:[5]}});
    const checks=()=>w.findAll('.meeting-reminders input[type=checkbox]');
    expect(checks()[0].element.checked).toBe(true);
    await checks()[2].setValue(true);
    expect(w.emitted('update:reminderOffsets')[0]).toEqual([[5,30]]);
    await w.setProps({reminderOffsets:[5,30]});
    expect(checks()[0].element.checked&&checks()[2].element.checked).toBe(true);
    await w.get('input[aria-label="Additional reminder minutes before"]').setValue(120);
    await w.get('.meeting-reminders button').trigger('click');
    expect(w.emitted('update:reminderOffsets')[1]).toEqual([[5,30,120]]);
    await w.setProps({reminderOffsets:[]});expect(w.text()).toContain('No reminders selected');
    await w.setProps({notifyParticipants:false});expect(w.find('.meeting-reminders').exists()).toBe(false);w.unmount();
  });
});
