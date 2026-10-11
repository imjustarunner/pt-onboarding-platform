import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../../../services/api',()=>({default:{put:vi.fn(async()=>({data:{}}))}}));
import api from '../../../services/api';
import Panel from '../ProviderUpdateSectionPanel.vue';
const prefs={personalEmailNotify:false,personalEmailDelayMode:'hours',personalEmailDelayHours:3,personalEmailDeliveryMode:'forward_one_to_one'};
const render=(retainsGoogle=false)=>shallowMount(Panel,{props:{section:{key:'notification_prefs',data:{appEmail:prefs},meta:{title:'Communications'}},token:'test',agencyId:2,recipient:{signIn:{retainsGoogle,transitionPlanned:!retainsGoogle}}},global:{stubs:{ProviderPersonalEmailPreferences:false}}});
beforeEach(()=>vi.clearAllMocks());
it('retains opt-out and a custom personal delay when the signed provider update is saved',async()=>{
 const w=render();await flushPromises();
 expect(w.findAll('input[type=radio]')[0].element.checked).toBe(true);
 expect(w.findAll('input[type=radio]')).toHaveLength(2);expect(w.find('select').exists()).toBe(false);
 expect(w.text()).toContain('Messages always arrive in the app');
 w.findComponent({name:'StaffCommunicationChoices'}).vm.$emit('save',{choices:{messageAlerts:false}});
 await flushPromises();
 expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({data:expect.objectContaining({emailReminderPreferences:prefs})}));
 w.unmount();
});
it('allows protected immediate delivery without turning off app replies',async()=>{
 const w=render();await flushPromises();await w.findAll('input[type=radio]')[1].setValue(true);
 await w.findAll('input[type=radio]')[5].setValue(true);
 expect(w.findAll('input[type=radio]')[3].element.checked).toBe(true);
 expect(w.text()).toContain('Reply by email or in the app');
 w.findComponent({name:'StaffCommunicationChoices'}).vm.$emit('save',{});await flushPromises();
 expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({data:expect.objectContaining({emailReminderPreferences:expect.objectContaining({personalEmailNotify:true,personalEmailDelayMode:'immediate'})})}));
 w.unmount();
});

it('hides personal reminders for retained Google accounts and omits stale settings on save',async()=>{const w=render(true);await flushPromises();expect(w.find('.email-reminders').exists()).toBe(false);w.findComponent({name:'StaffCommunicationChoices'}).vm.$emit('save',{choices:{messageAlerts:false}});await flushPromises();const payload=api.put.mock.calls[0][1];expect(payload.data.emailReminderPreferences).toBeUndefined();expect(payload.completed).toBe(true);w.unmount();});
it('preserves saved delivery choices while turning reminders off and on',async()=>{const w=render();await flushPromises();await w.findAll('input[type=radio]')[1].setValue(true);expect(w.text()).toContain('Your earlier timing setting is saved');await w.findAll('input[type=radio]')[4].setValue(true);await w.findAll('input[type=radio]')[0].setValue(true);expect(w.findAll('input[type=radio]')).toHaveLength(2);await w.findAll('input[type=radio]')[1].setValue(true);expect(w.findAll('input[type=radio]')[3].element.checked).toBe(true);expect(w.findAll('input[type=radio]')[4].element.checked).toBe(true);w.unmount();});
it('makes a preview read-only',async()=>{const w=render();await w.setProps({recipient:{previewOnly:true,signIn:{retainsGoogle:false}}});await flushPromises();expect(w.get('.email-reminders fieldset').element.disabled).toBe(true);w.unmount();});
