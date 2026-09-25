import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Settings from '../PersonalMessageDeliverySettings.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),patch:vi.fn()}}));
import api from '../../../services/api';
const initial={prefs:{personalEmailNotify:true,personalEmailDeliveryMode:'notification',personalEmailDelayMode:'business_day',personalEmailDelayHours:24},personalDelivery:{eligible:true,personalEmail:'private@example.org'}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:initial});api.patch.mockImplementation(async(_,prefs)=>({data:{...initial,prefs}}));});
describe('personal message delivery settings',()=>{
 it('shows the default and saves opt-out with a clear missed-message notice',async()=>{
  const w=mount(Settings);await flushPromises();expect(w.text()).toContain('private@example.org');expect(w.findAll('select')[0].element.value).toBe('business_day');expect(w.findAll('select')[1].element.value).toBe('notification');
  await w.get('input[type=checkbox]').setValue(false);expect(w.text()).toContain('so you do not miss messages');await w.get('button').trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/communications/prefs',expect.objectContaining({personalEmailNotify:false}),expect.anything());
 });
 it('saves a custom hour delay and explicit one-to-one forwarding',async()=>{
  const w=mount(Settings);await flushPromises();await w.findAll('select')[0].setValue('hours');await w.get('input[type=number]').setValue(3);await w.findAll('select')[1].setValue('forward_one_to_one');await w.get('button').trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/communications/prefs',expect.objectContaining({personalEmailDelayMode:'hours',personalEmailDelayHours:3,personalEmailDeliveryMode:'forward_one_to_one'}),expect.anything());expect(w.text()).toContain('Group conversations and secure messages always send a notification only');
 });
 it('offers immediate delivery and prevents invalid hour values',async()=>{
  const w=mount(Settings);await flushPromises();await w.findAll('select')[0].setValue('immediate');await w.get('button').trigger('click');await flushPromises();expect(api.patch.mock.calls[0][1].personalEmailDelayMode).toBe('immediate');
  await w.findAll('select')[0].setValue('hours');await w.get('input[type=number]').setValue(0);expect(w.get('button').attributes('disabled')).toBeDefined();
 });
 it('explains why active SSO accounts cannot forward to personal email',async()=>{
  api.get.mockResolvedValue({data:{...initial,personalDelivery:{eligible:false,reason:'sso'}}});const w=mount(Settings);await flushPromises();expect(w.text()).toContain('while that account is active');expect(w.find('input').exists()).toBe(false);
 });
 it('reports save failures without claiming settings were saved',async()=>{
  api.patch.mockRejectedValue(new Error('Offline'));const w=mount(Settings);await flushPromises();await w.get('button').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toContain('Could not save');expect(w.text()).not.toContain('settings saved.');
 });
});
