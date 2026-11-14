import {expect,it,vi} from 'vitest';
import {shallowMount} from '@vue/test-utils';
import Settings from '../AppointmentReminderSettings.vue';
it('lets staff customize and save additional reminders directly in Notifications',async()=>{
 const w=shallowMount(Settings,{props:{agencyId:377}});await w.findAll('button')[1].trigger('click');expect(w.emitted('update:mode')[0]).toEqual(['customizable']);await w.setProps({mode:'customizable',rules:[{id:'one',channel:'email',offsetMinutes:60}]});const editor=w.findComponent({name:'SessionNotificationEditor'});expect(editor.exists()).toBe(true);editor.vm.$emit('update:rules',[]);expect(w.emitted('update:rules')[0]).toEqual([[]]);await w.findAll('button').at(-1).trigger('click');expect(w.emitted('save')).toHaveLength(1);w.unmount();
});
