import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Toggle from '../AgencyClientCareToggle.vue';
const preferences={seesClients:true,acceptingNewClients:false,inPerson:true,virtual:true,school:false,waitlistEnabled:true,officeIds:[9],scheduleAgencyId:377,intakeStatusByFormat:{VIRTUAL:'waitlist'}};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{preferences,canManageCareAssignment:true}});api.put.mockResolvedValue({data:{preferences:{...preferences,seesClients:false}}});});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=mount(Toggle,{props:{providerId:501,agencyId:377,agencyName:'Inner Strength',canEdit:true}});await flushPromises();}
it('saves a care decision for only the selected membership and preserves its other availability settings',async()=>{
 await render();await wrapper.get('input').setValue(false);await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/availability/providers/501/public-settings',{...preferences,agencyId:377,seesClients:false,applyToAll:false},{skipGlobalLoading:true});
 expect(wrapper.emitted('updated')).toEqual([[{agencyId:377,seesClients:false}]]);expect(wrapper.text()).toContain('Saved for this agency');
});
it('restores the saved choice and shows the error if the server rejects a change',async()=>{
 await render();api.put.mockRejectedValue({response:{data:{error:{message:'Agency access required'}}}});
 await wrapper.get('input').setValue(false);await flushPromises();expect(wrapper.get('input').element.checked).toBe(true);expect(wrapper.get('[role=alert]').text()).toContain('Agency access required');expect(wrapper.emitted('updated')).toBeUndefined();
});
it('keeps care assignment controls disabled without administrator authority',async()=>{
 api.get.mockResolvedValue({data:{preferences,canManageCareAssignment:false}});await render();expect(wrapper.get('input').attributes()).toHaveProperty('disabled');expect(api.put).not.toHaveBeenCalled();
});
it('discards a prior agency’s delayed settings when the selected membership changes',async()=>{
 let finish;api.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 wrapper=mount(Toggle,{props:{providerId:501,agencyId:377,agencyName:'Inner Strength',canEdit:true}});
 await wrapper.setProps({agencyId:8,agencyName:'Rise Revive'});await flushPromises();finish({data:{preferences:{...preferences,seesClients:false},canManageCareAssignment:true}});await flushPromises();
 expect(wrapper.get('input').element.checked).toBe(true);expect(wrapper.text()).toContain('Rise Revive');
});
