import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Workspace from '../ProviderAvailabilityWorkspace.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1,role:'support'}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
const detail={weekStart:'2030-01-07',timeZone:'America/Denver',scheduleAgencyId:2,canEditSource:true,virtualSlots:[{startAt:'2030-01-09T15:00:00Z',endAt:'2030-01-09T16:00:00Z'},{startAt:'2030-01-09T16:00:00Z',endAt:'2030-01-09T17:00:00Z'}],inPersonSlots:[],weekly:[{id:18,dayOfWeek:'Wednesday',startTime:'08:00',endTime:'10:00',frequency:'WEEKLY',availableForIntake:true}],publications:[],diagnostics:[]};
const render=()=>mount(Workspace,{props:{agencyId:2},global:{stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'},ProviderAvailabilitySettings:{props:['providerId','agencyId'],template:'<div class="settings-stub" />'},VirtualWorkingHoursEditor:true}}});
const click=async(w,label)=>{await w.findAll('button').find(b=>b.text()===label).trigger('click');await flushPromises();};
beforeEach(()=>{vi.resetAllMocks();HTMLDialogElement.prototype.showModal=vi.fn();HTMLDialogElement.prototype.close=vi.fn();vi.spyOn(window,'confirm').mockReturnValue(true);api.get.mockImplementation(async url=>({data:url.endsWith('/providers')?[{id:9,first_name:'Example',last_name:'Provider'}]:detail}));api.delete.mockResolvedValue({data:{ok:true}});});
describe('staff availability workspace',()=>{
 it('shows grouped openings and opens the selected provider preferences',async()=>{const w=render();await flushPromises();await click(w,'Manage availability');expect(w.findAll('.day-grid article')).toHaveLength(1);expect(w.findAll('.day-grid article p')).toHaveLength(2);await click(w,'Preferences');expect(w.findComponent('.settings-stub').props()).toMatchObject({providerId:9,agencyId:2});w.unmount();});
 it('removes a weekly publication through the selected provider and agency endpoint',async()=>{const w=render();await flushPromises();await click(w,'Manage availability');await click(w,'Add / remove hours');await click(w,'Remove availability window');expect(api.delete).toHaveBeenCalledWith('/availability/providers/9/publications/weekly/18',{params:{agencyId:2}});expect(w.text()).toContain('Published availability removed.');w.unmount();});
 it('does not delete a publication when removal is canceled',async()=>{window.confirm.mockReturnValue(false);const w=render();await flushPromises();await click(w,'Manage availability');await click(w,'Add / remove hours');await click(w,'Remove availability window');expect(api.delete).not.toHaveBeenCalled();w.unmount();});
 it('keeps failed checks distinct from no openings',async()=>{api.get.mockImplementation(async url=>{if(url.endsWith('/week'))throw Error('unavailable');return {data:url.endsWith('/providers')?[{id:9,first_name:'Example'}]:detail};});const w=render();await flushPromises();expect(w.text()).toContain('Could not check openings');expect(w.text()).not.toContain('No new-client openings this week');w.unmount();});
});
