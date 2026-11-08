import {afterEach,it,expect,vi} from 'vitest';
import {flushPromises,shallowMount} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn().mockResolvedValue({data:{}}),patch:vi.fn().mockResolvedValue({data:{}}),post:vi.fn().mockResolvedValue({data:{}})}));
vi.mock('../../../services/api',()=>({default:api}));
import Services from '../TenantServicesAdmin.vue';
let wrapper;afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();});
it('preserves saved custom durations, supplies psychotherapy presets and saves explicit defaults',async()=>{
 wrapper=shallowMount(Services,{props:{agencyId:450}});await flushPromises();const state=wrapper.vm.$.setupState;
 state.editService({id:32,name:'Short session',serviceCode:'90832',defaultDurationMinutes:35,businessType:'mental_health'});await flushPromises();expect(state.form.defaultDurationMinutes).toBe(35);
 state.form.serviceCode='90837';state.applyServiceDurationPreset();expect(state.form.defaultDurationMinutes).toBe(60);
 state.form.serviceCode='90832';state.applyServiceDurationPreset();expect(state.form.defaultDurationMinutes).toBe(30);
 state.form.defaultDurationMinutes=35;await state.saveService();expect(api.patch).toHaveBeenCalledWith('/tenant-booking/agencies/450/tenant-services/32',expect.objectContaining({defaultDurationMinutes:35}));
});
it('requires a valid explicit default before saving',async()=>{
 wrapper=shallowMount(Services,{props:{agencyId:450}});await flushPromises();const state=wrapper.vm.$.setupState;state.form.name='Custom service';
 for(const value of ['',null,0,3.5,481]){state.form.defaultDurationMinutes=value;await state.saveService();expect(state.error).toContain('5 to 480');}
 expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
