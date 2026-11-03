import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import AppointmentBillingPanel from '../AppointmentBillingPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const payload={financialAccess:true,primaryPolicy:{insurerName:'Synthetic insurance'},progress:[{claimId:1,status:'rejected',label:'Rejected',step:2,actions:['Confirm documented location.'],financial:{chargeCents:14000,currency:'USD'}}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:payload});});
it('shows only insurer, responsible party and card status for a provider even if the server sends financial fields',async()=>{
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clinicalSessionId:3}});await flushPromises();
  expect(w.text()).toContain('Synthetic insurance');expect(w.text()).toContain('Responsible party');expect(w.text()).toContain('Payment method');expect(w.text()).not.toContain('Rejected');expect(w.text()).not.toContain('Confirm documented location.');expect(w.text()).not.toContain('$140');expect(w.text()).not.toContain('Charge details');expect(w.find('[aria-label="Claim progress"]').exists()).toBe(false);expect(w.emitted('open-note')).toBeUndefined();w.unmount();
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

it('loads nonfinancial client coverage even before a scheduled session has a clinical session ID',async()=>{
  api.get.mockResolvedValue({data:{policies:[{position:'primary',insurerName:'DEMO QA Coverage'}],paymentSetup:{medicaid:false,cardOnFile:true,responsibleParties:[{name:'DEMO QA Responsible Adult'}]}}});
  const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clientId:22}});await flushPromises();expect(api.get).toHaveBeenCalledWith('/clients/22/care-billing-summary',{skipGlobalLoading:true});expect(w.text()).toContain('DEMO QA Coverage');expect(w.text()).toContain('DEMO QA Responsible Adult');expect(w.text()).toContain('Card on file');expect(w.find('[aria-label="Claim progress"]').exists()).toBe(false);w.unmount();
});

it('reads primary and secondary insurers from the minimal session response',async()=>{api.get.mockResolvedValue({data:{financialAccess:false,clientId:22,policies:[{position:'primary',insurerName:'DEMO QA Primary'},{position:'secondary',insurerName:'DEMO QA Secondary'}],paymentSetup:{medicaid:true,responsibleParties:[{name:'DEMO QA Adult'}]}}});const w=mount(AppointmentBillingPanel,{props:{agencyId:377,clientId:22,clinicalSessionId:3}});await flushPromises();expect(w.text()).toContain('DEMO QA Primary');expect(w.text()).toContain('DEMO QA Secondary');expect(w.text()).toContain('Not required for Medicaid');expect(w.find('[aria-label="Claim progress"]').exists()).toBe(false);w.unmount();});
