import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import AppointmentBillingPanel from '../AppointmentBillingPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const payload={financialAccess:true,primaryPolicy:{insurerName:'Synthetic insurance'},progress:[{claimId:1,status:'rejected',label:'Rejected',step:2,actions:['Confirm documented location.'],financial:{chargeCents:14000,currency:'USD'}}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:payload});});
it('shows progress and correction actions without financials for a provider even if server accidentally sends them',async()=>{
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clinicalSessionId:3}});await flushPromises();
  expect(w.text()).toContain('Rejected');expect(w.text()).toContain('Confirm documented location.');expect(w.text()).not.toContain('$140');expect(w.text()).not.toContain('Charge details');
  await w.findAll('button').find(b=>b.text().includes('documentation')).trigger('click');expect(w.emitted('open-note')).toHaveLength(1);w.unmount();
});
it('requires server financial permission as well as the client permission',async()=>{
  api.get.mockResolvedValue({data:{...payload,financialAccess:false}});
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clinicalSessionId:3,canViewFinancials:true}});await flushPromises();expect(w.text()).not.toContain('$140');w.unmount();
});
it('shows a closed zero patient balance and retains prior cash for refund review',async()=>{
  api.get.mockResolvedValue({data:{...payload,progress:[{...payload.progress[0],payerSequence:1,financial:{...payload.progress[0].financial,patient:{responsibilityCents:0,paidCents:3000,balanceCents:0,refundReviewCents:3000,status:'paid',currency:'USD'}}}]}});
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clinicalSessionId:3,canViewFinancials:true}});await flushPromises();
  const breakdown=w.find('[aria-label="Patient payment breakdown"]');expect(breakdown.text()).toContain('Remaining patient balance$0.00');expect(breakdown.text()).toContain('Refund review: $30.00');w.unmount();
});
it('shows recorded charges to billing staff and clears old agency data before loading another scope',async()=>{
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clinicalSessionId:3,canViewFinancials:true}});await flushPromises();expect(w.text()).toContain('$140.00');
  api.get.mockImplementation(()=>new Promise(()=>{}));await w.setProps({agencyId:378});expect(w.text()).not.toContain('$140.00');expect(w.text()).not.toContain('Synthetic insurance');w.unmount();
});
