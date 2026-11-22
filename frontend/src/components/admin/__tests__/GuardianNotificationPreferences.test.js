import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Preferences from '../GuardianNotificationPreferences.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../ClientReminderTextConsent.vue',()=>({default:{template:'<div>Consent review</div>'}}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/preferences')?{email_enabled:true,sms_enabled:true}:url.includes('reminder-text-consent')?{recipients:[{id:20,textChoices:{reminders:{state:'opted_out',keyword:'NOREMIND'},care:{state:'on'}}}]}:{optionalRemindersEnabled:true,confirmationRequestsEnabled:true,providerPushedUpdatesEnabled:true,schedulingChangesEnabled:true}}));api.put.mockResolvedValue({data:{}});});
it('shows inherited category channels and the actual NOREMIND state without turning it back on',async()=>{
 const w=mount(Preferences,{props:{guardianId:20,clients:[{client_id:4,full_name:'Child'}],canEdit:true}});await flushPromises();
 expect(w.text()).toContain('NOREMIND');expect(w.findAll('tbody tr')).toHaveLength(4);
 expect(w.findAll('tbody tr')[0].text()).toContain('Off · NOREMIND');expect(w.findAll('tbody tr')[3].text()).toContain('On');
 await w.get('button').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/users/20/guardian-session-preferences/4',expect.objectContaining({optionalRemindersEnabled:true,channels:{email:true,sms:true,in_app:true,phone:false}}),{skipGlobalLoading:true});
 expect(api.put.mock.calls.some(([url])=>url.includes('consent'))).toBe(false);expect(w.get('button').attributes('disabled')).toBeUndefined();w.unmount();
});
it('keeps explicit category opt-outs while enabling a master channel',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/preferences')?{email_enabled:false,sms_enabled:false}:url.includes('reminder-text-consent')?{recipients:[]}:{optionalRemindersEnabled:false}}));
 const w=mount(Preferences,{props:{guardianId:20,clients:[{client_id:4}],canEdit:true}});await flushPromises();
 await w.findAll('.channel-cards input')[0].setValue(true);expect(w.findAll('tbody input')[0].element.checked).toBe(false);w.unmount();
});
