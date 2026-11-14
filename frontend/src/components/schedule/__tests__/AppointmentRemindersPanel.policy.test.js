import {expect,it} from 'vitest';
import {mount} from '@vue/test-utils';
import Panel from '../AppointmentRemindersPanel.vue';
it('offers only permitted manual channels and sends the selected channel immediately',async()=>{
 const w=mount(Panel,{props:{appointmentId:12,canPushExtra:true,manualChannels:['email']}});expect(w.text()).not.toContain('Text message');await w.findAll('button').find(button=>button.text()==='Send reminder now').trigger('click');expect(w.emitted('push-extra')).toEqual([[['email']]]);w.unmount();
});
it('blocks a manual push during its 24-hour cooldown and shows the next time',()=>{
 const w=mount(Panel,{props:{appointmentId:12,canPushExtra:false,manualChannels:['email','sms'],availableAt:'2026-11-15T20:00:00Z'}});expect(w.findAll('button').find(button=>button.text()==='Send reminder now').attributes('disabled')).toBeDefined();expect(w.text()).toContain('24-hour cooldown');w.unmount();
});
