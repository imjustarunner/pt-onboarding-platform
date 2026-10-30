import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Form from '../SchoolSupportSubmit.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
let wrapper;
const balances=()=>({policy:{schoolSupportEnabled:true},account:{school_support_eligible:true},balances:{schoolSupportHours:3,schoolSupportPendingHours:1},schoolSupportPayRate:18});
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:balances()});m.post.mockResolvedValue({data:{status:'approved',approved_rates_json:[{hours:1,rate:18,payrollPeriodId:148}]}});});
afterEach(()=>wrapper?.unmount());
async function create(){wrapper=mount(Form,{props:{agencyId:2}});await flushPromises();}
async function fill(){await wrapper.get('input[type="date"]').setValue('2026-10-30');await wrapper.get('input[type="number"]').setValue('1');}
it('offers a temporary date-and-hours form without proof or appointment fields',async()=>{
 await create();expect(wrapper.text()).toContain('Temporary');expect(wrapper.text()).toContain('2 hours available');expect(wrapper.text()).toContain('No attachment, appointment link, or payroll approval');expect(wrapper.findAll('input')).toHaveLength(2);
 await fill();await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/payroll/me/pto-requests',expect.objectContaining({agencyId:2,requestType:'school_support',submissionKey:expect.any(String),items:[{date:'2026-10-30',hours:1}]}));
 expect(wrapper.text()).toContain('1 hour and $18.00 added to payroll');expect(wrapper.emitted('submitted')).toHaveLength(1);
});
it('reuses the same key after a failed response so retrying cannot pay twice',async()=>{
 await create();await fill();m.post.mockRejectedValueOnce(new Error('Connection interrupted'));
 await wrapper.get('form').trigger('submit');await flushPromises();await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.post.mock.calls[0][1].submissionKey).toBe(m.post.mock.calls[1][1].submissionKey);
});
it('prevents duplicate clicks while the first submission is in flight',async()=>{
 await create();await fill();let finish;m.post.mockReturnValueOnce(new Promise(resolve=>finish=resolve));
 await wrapper.get('form').trigger('submit');await wrapper.get('form').trigger('submit');expect(m.post).toHaveBeenCalledTimes(1);
 finish({data:{approved_rates_json:[{hours:1,rate:18}]}});await flushPromises();
});
it('rejects more than the available balance after pending reservations',async()=>{
 await create();await fill();await wrapper.get('input[type="number"]').setValue('3');await wrapper.get('form').trigger('submit');await flushPromises();expect(m.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('within your available balance');
});
it('hides the form for non-school staff with no earned bank',async()=>{
 m.get.mockResolvedValue({data:{...balances(),account:{school_support_eligible:false},balances:{schoolSupportHours:0}}});await create();expect(wrapper.find('form').exists()).toBe(false);
});
it('discards the previous company balance after switching agencies',async()=>{
 let finish;m.get.mockReturnValueOnce(new Promise(resolve=>finish=resolve));wrapper=mount(Form,{props:{agencyId:2}});await wrapper.setProps({agencyId:6});await flushPromises();
 finish({data:{...balances(),balances:{schoolSupportHours:99}}});await flushPromises();expect(wrapper.text()).not.toContain('99');expect(wrapper.text()).toContain('2 hours available');
});
