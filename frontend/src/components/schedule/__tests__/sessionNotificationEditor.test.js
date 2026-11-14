import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
import Editor from '../SessionNotificationEditor.vue';
import Header from '../AppointmentHeaderFields.vue';
import Shell from '../AppointmentEditorShell.vue';
let wrapper;
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{settings:{platform:{channels:{email:'available',in_app:'available',sms:'disabled'}},channelsEnabled:{email:true,in_app:true}}}});});
afterEach(()=>wrapper?.unmount());
it('adds, edits, previews and removes reminder choices before an appointment exists',async()=>{
 wrapper=mount(Editor,{props:{agencyId:377,dateYmd:'2026-11-26',startTime:'15:00',timezoneLabel:'Mountain Time'}});await flushPromises();
 await wrapper.get('button').trigger('click');let rules=wrapper.emitted('update:rules').at(-1)[0];expect(rules).toEqual([expect.objectContaining({channels:['email'],offsetMinutes:60})]);await wrapper.setProps({rules});
 await wrapper.get('select[aria-label="Reminder 1 timing"]').setValue('1440');rules=wrapper.emitted('update:rules').at(-1)[0];expect(rules[0].offsetMinutes).toBe(1440);await wrapper.setProps({rules});
 await wrapper.get('textarea').setValue('Please arrive five minutes early.');rules=wrapper.emitted('update:rules').at(-1)[0];await wrapper.setProps({rules});
 expect(wrapper.get('.reminder-preview').text()).toContain('Please arrive five minutes early.');
 expect(wrapper.findAll('.reminder-channel').map(node=>node.text()).join(' ')).not.toMatch(/Text/);
 await wrapper.get('button[aria-label="Remove reminder 1"]').trigger('click');expect(wrapper.emitted('update:rules').at(-1)[0]).toEqual([]);
});
it('renders real controls in Customizable mode and explains scheduling note visibility',async()=>{
 wrapper=mount(Header,{props:{bookSessionLayout:true,agencyId:377,showNotifications:true,notificationMode:'customizable',showSchedulingNotes:true},global:{stubs:{ScheduleAgencyLogo:true}}});await flushPromises();
 expect(wrapper.findComponent(Editor).exists()).toBe(true);expect(wrapper.text()).not.toContain('Save the session, then open Notifications');
 expect(wrapper.get('[data-testid="scheduling-notes-visibility"]').text()).toContain('Synced calendar details');
 expect(wrapper.get('[data-testid="scheduling-notes-visibility"]').text()).toContain('family appointment list does not display');
});
it('keeps added reminders visible through the real appointment editor shell',async()=>{
 wrapper=mount(Shell,{props:{title:'Book Session',bookSessionLayout:true,agencyId:377,showNotifications:true,notificationMode:'customizable',
  'onUpdate:customReminders':rules=>wrapper.setProps({customReminders:rules})},global:{stubs:{ScheduleAgencyLogo:true}}});
 await flushPromises();
 await wrapper.getComponent(Editor).get('button').trigger('click');await flushPromises();
 expect(wrapper.getComponent(Editor).props('rules')).toHaveLength(1);
 expect(wrapper.get('select[aria-label="Reminder 1 timing"]').element.value).toBe('60');
 await wrapper.get('select[aria-label="Reminder 1 timing"]').setValue('1440');await flushPromises();
 expect(wrapper.props('customReminders')[0].offsetMinutes).toBe(1440);
 expect(wrapper.getComponent(Header).props('customReminders')).toEqual(wrapper.props('customReminders'));
});
