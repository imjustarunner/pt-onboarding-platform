import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SupervisionBody from '../SupervisionBody.vue';
const render=props=>mount(SupervisionBody,{props:{section:'controls',groupMode:true,notifyParticipants:true,showNotifyOption:true,attendanceReminders:{mandatory:[1440,60],optional:[1440]},...props},global:{stubs:{MeetingReminderEditor:{name:'MeetingReminderEditor',props:['modelValue','disabled'],template:'<button @click="$emit(\'update:modelValue\', [180])">Reminder editor</button>'}}}});
describe('separate supervision notification settings',()=>{
  it('updates mandatory reminders without changing optional reminders',async()=>{
    const wrapper=render();const editors=wrapper.findAllComponents({name:'MeetingReminderEditor'});
    expect(editors).toHaveLength(2);expect(wrapper.text()).toContain('Mandatory attendees · Compensated');
    editors[0].vm.$emit('update:modelValue',[180]);
    expect(wrapper.emitted('update:attendanceReminders')[0]).toEqual([{mandatory:[180],optional:[1440]}]);wrapper.unmount();
  });
  it('allows disabling optional reminders without changing mandatory reminders',()=>{
    const wrapper=render();wrapper.findAllComponents({name:'MeetingReminderEditor'})[1].vm.$emit('update:modelValue',[]);
    expect(wrapper.emitted('update:attendanceReminders')[0]).toEqual([{mandatory:[1440,60],optional:[]}]);wrapper.unmount();
  });
  it('keeps a single reminder editor for individual supervision',()=>{
    const wrapper=render({groupMode:false});expect(wrapper.findAllComponents({name:'MeetingReminderEditor'})).toHaveLength(1);wrapper.unmount();
  });
});
