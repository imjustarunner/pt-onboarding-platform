import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises,RouterLinkStub} from '@vue/test-utils';
import {reactive} from 'vue';
const mocks=vi.hoisted(()=>({auth:null}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';
import Summary from '../AuricwellBillingSummary.vue';

const data={organizations:[{id:2,name:'ITSCO',slug:'itsco'}],counts:{submitted:1,review:0,needsHelp:8}};
const mountSummary=(agencyId=2)=>mount(Summary,{props:{agencyId},global:{stubs:{RouterLink:RouterLinkStub}}});
beforeEach(()=>{vi.clearAllMocks();mocks.auth=reactive({user:{id:55,role:'admin',billingAgencyIds:[2,6]}});api.get.mockResolvedValue({data});});

it('shows the two workload counts and separate help row with matching scoped queue links',async()=>{
 const w=mountSummary();await flushPromises();expect(w.text()).toContain('AuricWell billing');expect(w.text()).toContain('ITSCO');
 expect(w.find('.billing-help b').text()).toBe('8');expect(w.findAll('.billing-counts strong').map(c=>c.text())).toEqual(['1','0']);
 expect(w.findAllComponents(RouterLinkStub).map(link=>link.props('to'))).toEqual(['submitted_or_processing','needs_review','needs_help'].map(billingStatus=>({path:'/auricwell/app',query:{billingSection:'claims',billingStatus,agencyId:'2'}})));
 expect(api.get).toHaveBeenCalledWith('/medical-billing/workspace/dashboard-summary',{params:{agencyId:2},skipGlobalLoading:true});w.unmount();
});
it.each([{role:'admin',billingAgencyIds:[]},{role:'provider',billingAgencyIds:[2]}])('does not request or show billing data without eligible permissions: %j',async user=>{
 mocks.auth.user={id:55,...user};const w=mountSummary();await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(w.find('section').exists()).toBe(false);w.unmount();
});
it('hides a stale frontend grant if the server refuses access',async()=>{
 api.get.mockRejectedValue({response:{status:403}});const w=mountSummary();await flushPromises();expect(w.find('section').exists()).toBe(false);w.unmount();
});
it('shows an unavailable state instead of zero claims after an error',async()=>{
 api.get.mockRejectedValue(new Error('Network unavailable'));const w=mountSummary();await flushPromises();expect(w.find('[role="alert"]').text()).toContain('unavailable');expect(w.find('.billing-counts').exists()).toBe(false);w.unmount();
});
it('does not let a late response from the prior agency overwrite the selected agency',async()=>{
 let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce({data:{organizations:[{id:6,name:'Next Level Up',slug:'next-level-up'}],counts:{submitted:0,review:2,needsHelp:1}}});
 const w=mountSummary();await w.setProps({agencyId:6});await flushPromises();resolve({data});await flushPromises();
 expect(w.text()).toContain('Next Level Up');expect(w.text()).not.toContain('ITSCO');expect(w.find('.billing-help b').text()).toBe('1');w.unmount();
});
