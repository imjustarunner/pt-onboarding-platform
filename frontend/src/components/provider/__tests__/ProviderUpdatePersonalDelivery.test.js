import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../../../services/api',()=>({default:{put:vi.fn(async()=>({data:{}}))}}));
import api from '../../../services/api';
import Panel from '../ProviderUpdateSectionPanel.vue';
const prefs={personalEmailNotify:false,personalEmailDelayMode:'hours',personalEmailDelayHours:3,personalEmailDeliveryMode:'forward_one_to_one'};
const render=()=>shallowMount(Panel,{props:{section:{key:'notification_prefs',data:{appEmail:prefs},meta:{title:'Communications'}},token:'test',agencyId:2}});
beforeEach(()=>vi.clearAllMocks());
it('retains opt-out and a custom personal delay when the signed provider update is saved',async()=>{
 const w=render();await flushPromises();
 expect(w.get('input[type=checkbox]').element.checked).toBe(false);
 expect(w.text()).toContain('Your earlier timing setting is saved');
 expect(w.text()).toContain('Messages always arrive in the app');
 w.findComponent({name:'StaffCommunicationChoices'}).vm.$emit('save',{choices:{messageAlerts:false}});
 await flushPromises();
 expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({data:expect.objectContaining({emailReminderPreferences:prefs})}));
 w.unmount();
});
it('allows protected immediate delivery without turning off app replies',async()=>{
 const w=render();await flushPromises();await w.get('input[type=checkbox]').setValue(true);
 const selects=w.findAll('select');await selects[1].setValue('immediate');
 expect(selects[0].element.value).toBe('forward_one_to_one');
 expect(w.text()).toContain('Both — reply to individual emails by email or in the app');
 w.findComponent({name:'StaffCommunicationChoices'}).vm.$emit('save',{});await flushPromises();
 expect(api.put).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({data:expect.objectContaining({emailReminderPreferences:expect.objectContaining({personalEmailNotify:true,personalEmailDelayMode:'immediate'})})}));
 w.unmount();
});
