import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SupervisionBody from '../SupervisionBody.vue';
const render=props=>mount(SupervisionBody,{props:{section:'controls',groupMode:true,notifyParticipants:true,showNotifyOption:true,attendanceReminders:{mandatory:[1440,60],optional:[1440]},...props},global:{stubs:{MeetingReminderEditor:{name:'MeetingReminderEditor',props:['modelValue','disabled'],template:'<button @click="$emit(\'update:modelValue\', [180])">Reminder editor</button>'}}}});
describe('separate supervision notification settings',()=>{
  it('updates mandatory reminders without changing optional reminders',async()=>{
    const wrapper=render();const editors=wrapper.findAllComponents({name:'MeetingReminderEditor'});
    expect(editors).toHaveLength(3);expect(wrapper.text()).toContain('Mandatory attendees');expect(wrapper.text()).toContain('Interns attend unpaid');
    editors[0].vm.$emit('update:modelValue',[180]);
    expect(wrapper.emitted('update:attendanceReminders')[0]).toEqual([{mandatory:[180],optional:[1440],presenter:[10080,2880,1440,180,60]}]);wrapper.unmount();
  });
  it('allows disabling optional reminders without changing mandatory reminders',()=>{
    const wrapper=render();wrapper.findAllComponents({name:'MeetingReminderEditor'})[1].vm.$emit('update:modelValue',[]);
    expect(wrapper.emitted('update:attendanceReminders')[0]).toEqual([{mandatory:[1440,60],optional:[],presenter:[10080,2880,1440,180,60]}]);wrapper.unmount();
  });
  it('keeps a single reminder editor for individual supervision',()=>{
    const wrapper=render({groupMode:false});expect(wrapper.findAllComponents({name:'MeetingReminderEditor'})).toHaveLength(1);wrapper.unmount();
  });
});

it('configures presenters independently and requires explicit signup broadcast opt-in',async()=>{
 const wrapper=render();wrapper.findAllComponents({name:'MeetingReminderEditor'})[2].vm.$emit('update:modelValue',[]);
 expect(wrapper.emitted('update:attendanceReminders')[0][0]).toEqual({mandatory:[1440,60],optional:[1440],presenter:[]});
 await wrapper.setProps({signupOnly:true});expect(wrapper.findAllComponents({name:'MeetingReminderEditor'})).toHaveLength(0);
 const checkbox=wrapper.findAll('input[type="checkbox"]').find(input=>input.element.parentElement.textContent.includes('Send one signup invitation'));
 expect(checkbox.element.checked).toBe(false);await checkbox.setValue(true);
 expect(wrapper.emitted('update:signupInvitationEnabled')[0]).toEqual([true]);wrapper.unmount();
});
