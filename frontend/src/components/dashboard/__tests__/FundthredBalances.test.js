import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Balances from '../FundthredBalances.vue';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
let wrapper;
beforeEach(()=>{m.get.mockReset().mockResolvedValue({data:{policy:{trainingPtoEnabled:true,sharedLeaveAccrualEnabled:true,schoolSupportEnabled:true},account:{school_support_eligible:true},balances:{sickHours:12,trainingHours:4,schoolSupportHours:3},effectivePtoPayRate:20,schoolSupportPayRate:18}});});
afterEach(()=>wrapper?.unmount());
it('shows sick leave, shared training PTO and the school bank together with a temporary-use action',async()=>{
 wrapper=mount(Balances,{props:{agencyId:2},global:{stubs:{SchoolSupportSubmit:{template:'<div data-test="school-form" />'}}}});await flushPromises();
 expect(wrapper.findAll('article')).toHaveLength(3);expect(wrapper.text()).toContain('Sick leave');expect(wrapper.text()).toContain('Training PTO');expect(wrapper.text()).toContain('School Support Hours');
 const button=wrapper.findAll('button').find(b=>b.text().includes('Use hours — Temporary'));await button.trigger('click');expect(wrapper.find('[data-test="school-form"]').exists()).toBe(true);
});
it('still shows an earned school balance after the assignment ends',async()=>{
 const data=(await m.get()).data;data.account.school_support_eligible=false;m.get.mockResolvedValue({data});wrapper=mount(Balances,{props:{agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('School Support Hours');
});
