import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import Records from '../ClientSupplementaryRecords.vue';
beforeEach(()=>vi.resetAllMocks());
it('shows patient comments in their own administrative section and keeps contact details separate',async()=>{
 m.get.mockResolvedValue({data:{administrativeNote:'Office client\nCall after payment',contacts:[{affiliationId:1,fullName:'Pat Example',company:'Example School',workPhone:'555-111-2222',roiSigned:'Not signed by patient/guardian'}],insurance:{primary:{insurerName:'Example carrier',copay:'$20.00'}},billingComments:'$300 deductible'}});
 const wrapper=mount(Records,{global:{stubs:{ClientMedicalHistory:true}},props:{clientId:12,agencyId:2}});await flushPromises();
 expect(wrapper.get('[aria-label="Administrative note"]').text()).toContain('Office client\nCall after payment');expect(wrapper.get('[aria-label="Additional contacts"]').text()).toContain('Example School');expect(wrapper.get('[aria-label="Insurance"]').text()).toContain('$20.00');expect(wrapper.get('[aria-label="Billing comments"]').text()).toContain('$300 deductible');wrapper.unmount();
});
it('renders no private section when the server denies access',async()=>{
 m.get.mockRejectedValue({response:{status:403}});const wrapper=mount(Records,{global:{stubs:{ClientMedicalHistory:true}},props:{clientId:12,agencyId:2}});await flushPromises();expect(wrapper.find('[aria-label="Administrative note"]').exists()).toBe(false);expect(wrapper.text()).toBe('');wrapper.unmount();
});
it('clears the previous client’s note immediately and discards late responses',async()=>{
 let resolve;const previous=new Promise(done=>{resolve=done;});m.get.mockReturnValueOnce(previous).mockResolvedValueOnce({data:{administrativeNote:'Current note',contacts:[],insurance:null}});
 const wrapper=mount(Records,{global:{stubs:{ClientMedicalHistory:true}},props:{clientId:12,agencyId:2}});await wrapper.setProps({clientId:13});await flushPromises();resolve({data:{administrativeNote:'Previous note',contacts:[]}});await flushPromises();expect(wrapper.text()).toContain('Current note');expect(wrapper.text()).not.toContain('Previous note');wrapper.unmount();
});
it('shows verification and its date from app evidence separately from pasted eligibility text',async()=>{
 m.get.mockResolvedValue({data:{contacts:[],insurance:{primary:{insurerName:'Example carrier',lastEligibilityCheck:'Not verified'}},verification:{current:true,verifiedAt:'2026-11-16T12:00:00Z',serviceDate:'2026-11-17'}}});
 const w=mount(Records,{global:{stubs:{ClientMedicalHistory:true}},props:{clientId:12,agencyId:2}});await flushPromises();expect(w.text()).toContain('VERIFIED');expect(w.text()).toContain('11/16/2026');w.unmount();
});
