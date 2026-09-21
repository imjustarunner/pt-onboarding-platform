import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import TeamMeetingBody from '../TeamMeetingBody.vue';
import SupervisionBody from '../SupervisionBody.vue';
describe.each([['team meetings',TeamMeetingBody],['supervision',SupervisionBody]])('%s reminder editor',(_,component)=>{
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
