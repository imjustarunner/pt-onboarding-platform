import { shallowMount,flushPromises } from '@vue/test-utils';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { createPinia,setActivePinia } from 'pinia';
import { notifySupervisionHoursChanged } from '../../../utils/supervisionHoursRefresh.js';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'super_admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2},agencies:[]})}));
vi.mock('vue-router',()=>({useRoute:()=>({query:{},params:{}}),useRouter:()=>({push:vi.fn()})}));
import Modal from '../SupervisionModal.vue';
let wrapper;
beforeEach(()=>{
 setActivePinia(createPinia());vi.clearAllMocks();
 m.get.mockImplementation(async url=>({data:url.includes('supervisor-assignments')?[]:url.includes('hours-summary')?{ok:true,totalHours:1.42,individualHours:0.92,groupHours:0.5,sessionCount:2}:url.includes('dashboard-summary')?{supervision:{enabled:true,isPrelicensed:true,individualHours:2.92,groupHours:1.5,totalHours:4.42}}:{}}));
});
afterEach(()=>wrapper?.unmount());
it('reads balances after attendance finalization, refreshes on corrections and focus, and scopes events by agency',async()=>{
 wrapper=shallowMount(Modal,{global:{stubs:{RouterLink:true}}});await flushPromises();
 const s=wrapper.vm.$.setupState;s.selectedSupervisee={supervisee_id:20,agency_id:2};await flushPromises();
 expect(s.supervisionAttendanceIndividualHours).toBe(0.92);expect(s.supervisionAttendanceGroupHours).toBe(0.5);
 const calls=m.get.mock.calls.map(([url])=>url);
 expect(calls.findIndex(u=>u.includes('dashboard-summary'))).toBeGreaterThan(calls.findIndex(u=>u.includes('hours-summary')));
 m.get.mockClear();notifySupervisionHoursChanged({agencyId:99});await flushPromises();expect(m.get).not.toHaveBeenCalled();
 notifySupervisionHoursChanged({agencyId:2});await flushPromises();expect(m.get.mock.calls.some(([u])=>u.includes('dashboard-summary'))).toBe(true);
 m.get.mockClear();window.dispatchEvent(new Event('focus'));await flushPromises();expect(m.get.mock.calls.some(([u])=>u.includes('hours-summary'))).toBe(true);
 wrapper.unmount();m.get.mockClear();notifySupervisionHoursChanged({agencyId:2});window.dispatchEvent(new Event('focus'));expect(m.get).not.toHaveBeenCalled();
});
