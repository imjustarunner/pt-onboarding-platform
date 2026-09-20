import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Settings from '../ProviderAvailabilitySettings.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'admin'}})}));
const state={preferences:{seesClients:true,acceptingNewClients:true,inPerson:true,virtual:true},reminders:[{format:'VIRTUAL',notificationId:3,snoozed:false}],checkedAt:'2026-09-17T16:00:00Z'};
const render=()=>mount(Settings,{props:{providerId:9,agencyId:2},global:{stubs:{ProviderServiceOfferings:true,RouterLink:{props:['to'],template:'<a :data-to="JSON.stringify(to)"><slot/></a>'}}}});
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:state});});
describe('provider availability settings',()=>{
 it('keeps a snoozed warning in settings and links to the actual provider schedule',async()=>{const w=render();await flushPromises();api.post.mockResolvedValue({data:{...state,reminders:[{...state.reminders[0],snoozed:true,snoozedUntil:'2026-09-24T16:00:00Z'}]}});await w.find('.warning button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/availability/providers/9/public-settings/snooze',{agencyId:2,format:'VIRTUAL'},expect.any(Object));expect(w.find('.warning').text()).toContain('No virtual');expect(w.find('.warning').text()).toContain('snoozed until');expect(w.find('.actions a').attributes('data-to')).toContain('schedule_availability');w.unmount();});
 it('persists independent format choices and preserves errors without false success',async()=>{const w=render();await flushPromises();await w.findAll('label').find(l=>l.text().includes('Open for in-person')).find('input').setValue(false);api.put.mockRejectedValue({response:{data:{error:{message:'Save failed'}}}});await w.find('.actions button').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/availability/providers/9/public-settings',{agencyId:2,seesClients:true,acceptingNewClients:true,inPerson:false,virtual:true},expect.any(Object));expect(w.find('[role=alert]').text()).toBe('Save failed');expect(w.emitted('updated')).toBeUndefined();w.unmount();});
});
