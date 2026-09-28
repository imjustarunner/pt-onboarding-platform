import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Row from '../ProviderAvailabilityRow.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{put:vi.fn()}}));
const person={id:9,first_name:'Example',last_name:'Provider',title:'Counselor',profilePhotoUrl:'/uploads/example.jpg',preferences:{seesClients:true,acceptingNewClients:true,inPerson:false,virtual:true,school:true,waitlistEnabled:false,officeIds:null,scheduleAgencyId:2},offices:[],services:[{serviceType:'counseling',displayName:'Counseling',offered:true,onlineScheduling:true}]};
const render=()=>mount(Row,{props:{person:structuredClone(person),agencyId:2,canEdit:true,profileLink:{path:'/itsco/admin/users/9'}},global:{stubs:{RouterLink:true}}});
beforeEach(()=>vi.resetAllMocks());
describe('provider preference row',()=>{
 it('keeps changes local until this provider is explicitly saved',async()=>{const w=render();expect(w.find('img').attributes('src')).toBe('/uploads/example.jpg');await w.find('input[aria-label="Example Provider: In person"]').setValue(true);expect(api.put).not.toHaveBeenCalled();api.put.mockResolvedValue({data:{preferences:{...person.preferences,inPerson:true}}});await w.findAll('button').find(b=>b.text()==='Save changes').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/availability/providers/9/public-settings',expect.objectContaining({agencyId:2,inPerson:true,virtual:true,officeIds:null,applyToAll:false}),expect.any(Object));expect(w.emitted('saved')[0][0].preferences.inPerson).toBe(true);});
 it('retains unsaved choices and shows a failed save',async()=>{const w=render();api.put.mockRejectedValue(new Error('offline'));await w.find('input[aria-label="Example Provider: Virtual"]').setValue(false);await w.findAll('button').find(b=>b.text()==='Save changes').trigger('click');await flushPromises();expect(w.find('[role=alert]').text()).toContain('Could not save');expect(w.find('input[aria-label="Example Provider: Virtual"]').element.checked).toBe(false);expect(w.emitted('saved')).toBeUndefined();});
 it('does not present an incomplete calendar check as confirmed unavailability',async()=>{const w=render();await w.setProps({summary:{virtualSlots:[],inPersonSlots:[],calendarWarnings:['Unavailable calendar']}});expect(w.text()).toContain('Availability not confirmed');expect(w.text()).not.toContain('No posted openings');expect(w.text()).toContain('Online: Counseling');});
});
