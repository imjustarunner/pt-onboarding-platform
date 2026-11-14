import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,shallowMount} from '@vue/test-utils';
import Settings from '../AppointmentReminderSettings.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
const rule={id:'five-hours',channels:['email','sms','in_app'],offsetMinutes:300,message:'',askConfirmation:true};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('my-default')?{rules:[rule]}:{settings:{reminderRules:[rule]}}}));api.put.mockResolvedValue({data:{rules:[rule]}});});
it('lets staff customize and save an independent reminder schedule in Notifications',async()=>{
 const w=shallowMount(Settings,{props:{agencyId:377}});await flushPromises();
 await w.findAll('button').find(button=>button.text()==='Custom').trigger('click');expect(w.emitted('update:mode')[0]).toEqual(['customizable']);
 await w.setProps({mode:'customizable',rules:[rule]});const editor=w.findComponent({name:'SessionNotificationEditor'});expect(editor.exists()).toBe(true);
 editor.vm.$emit('update:rules',[]);expect(w.emitted('update:rules').at(-1)).toEqual([[]]);
 await w.findAll('button').find(button=>button.text()==='Save reminder settings').trigger('click');expect(w.emitted('save')).toHaveLength(1);w.unmount();
});
it('loads My default as the appointment’s complete reminder schedule',async()=>{
 const w=shallowMount(Settings,{props:{agencyId:377}});await flushPromises();
 await w.findAll('button').find(button=>button.text()==='My default').trigger('click');
 expect(w.emitted('update:rules').at(-1)).toEqual([[rule]]);expect(w.emitted('update:mode').at(-1)).toEqual(['customizable']);expect(w.emitted('save')).toBeUndefined();w.unmount();
});
it('saves a provider’s default separately from saving the appointment',async()=>{
 const w=shallowMount(Settings,{props:{agencyId:377,mode:'customizable',rules:[rule]}});await flushPromises();
 await w.findAll('button').find(button=>button.text()==='Custom').trigger('click');
 await w.findAll('button').find(button=>button.text()==='Save as My default').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/tenant-booking/agencies/377/session-notifications/my-default',{rules:[rule]},{skipGlobalLoading:true});expect(w.emitted('save')).toBeUndefined();w.unmount();
});
