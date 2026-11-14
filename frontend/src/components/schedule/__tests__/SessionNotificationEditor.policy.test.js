import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Editor from '../SessionNotificationEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const settings={platform:{channels:{email:'available',sms:'consent_required',in_app:'available'},allowTenantDisable:{email:true,sms:true,in_app:true}},channelsEnabled:{email:true,sms:true,in_app:true}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{settings}});});
it('lets a provider choose five hours and combine email, text, and in-app',async()=>{
 const w=mount(Editor,{props:{agencyId:377,rules:[{id:'one',channel:'email',offsetMinutes:60,message:''}]}});await flushPromises();
 await w.get('select[aria-label="Reminder 1 timing"]').setValue('300');expect(w.emitted('update:rules').at(-1)[0][0].offsetMinutes).toBe(300);
 await w.get('input[aria-label="Reminder 1 Text message"]').setValue(true);let rules=w.emitted('update:rules').at(-1)[0];await w.setProps({rules});
 await w.get('input[aria-label="Reminder 1 In-app"]').setValue(true);expect(w.emitted('update:rules').at(-1)[0][0].channels).toEqual(['email','sms','in_app']);w.unmount();
});
it('accepts custom timing and exposes a five-minute preset',async()=>{
 const w=mount(Editor,{props:{agencyId:377,rules:[{id:'one',channels:['email'],offsetMinutes:60}]}});await flushPromises();
 expect(w.get('select[aria-label="Reminder 1 timing"] option[value="5"]').text()).toContain('5 minutes');await w.get('select[aria-label="Reminder 1 timing"]').setValue('custom');await w.get('input[aria-label="Reminder 1 custom minutes"]').setValue('17');
 expect(w.emitted('update:rules').at(-1)[0][0].offsetMinutes).toBe(17);w.unmount();
});
