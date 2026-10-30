import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Panel from '../MissedSessionFeesPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{policy:{enabled:true,effectiveOn:'2026-11-01'},fees:[{id:1,appointmentId:70,receivableId:90,eventDate:'2026-11-10',category:3,percent:40,netCollectedCents:8000,entitlementCents:3200,approvedCents:0}]}});api.post.mockResolvedValue({data:{receivableId:91}});});
describe('missed-session billing to payroll',()=>{
 it('shows the $80 / $32 collected fee share and keeps service time separate',async()=>{
  const w=mount(Panel,{props:{agencyId:2}});await flushPromises();expect(w.text()).toContain('$80.00');expect(w.text()).toContain('$32.00');expect(w.text()).toContain('Work and required waiting time are recorded and paid separately');expect(w.text()).toContain('never automatically deducts wages');w.unmount();
 });
 it('prepares an explicit reviewed fee, with no payment request or automatic policy activation',async()=>{
  const w=mount(Panel,{props:{agencyId:6,clients:[{id:12,name:'Synthetic client'}]}});await flushPromises();
  const form=w.findAll('form')[1];await form.find('select').setValue(12);const inputs=form.findAll('input');await inputs[0].setValue(70);await inputs[1].setValue('20.00');await inputs[2].setValue('Signed agreement reference 100');await inputs[3].setValue(true);await form.trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/family-billing/staff/missed-session-fees',{agencyId:6,clientId:12,appointmentId:70,amountCents:2000,agreementConfirmed:true,agreementReference:'Signed agreement reference 100'});
  expect(api.put).not.toHaveBeenCalled();expect(api.post).toHaveBeenCalledTimes(1);expect(w.text()).toContain('No payment was charged.');w.unmount();
 });
 it('submits a bound package agreement review while preserving the makeup credit',async()=>{
  const w=mount(Panel,{props:{agencyId:6,clients:[{id:12,name:'Synthetic client'}]}});await flushPromises();const form=w.findAll('form')[1];
  const label=text=>form.findAll('label').find(l=>l.text().startsWith(text));
  await form.find('select').setValue(12);await label('Appointment ID').find('input').setValue(70);await label('Agreed fee').find('input').setValue('20');await label('Signed agreement reference').find('input').setValue('Signed package amendment 100');await label('The existing signed agreement').find('input').setValue(true);await label('Review a separate fee').find('input').setValue(true);
  await label('Package entitlement ID').find('input').setValue(50);await label('Agreement signed on').find('input').setValue('2026-10-29');await label('Separate fee terms effective on').find('input').setValue('2026-11-01');await label('Maximum separate fee').find('input').setValue(20);await label('I reviewed the signed agreement').find('input').setValue(true);await label('The unused makeup credit').find('input').setValue(true);await form.trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/family-billing/staff/missed-session-fees',expect.objectContaining({packageFeeReview:{entitlementId:50,agreementReference:'Signed package amendment 100',signedOn:'2026-10-29',effectiveOn:'2026-11-01',permittedFeeCents:2000,separateFeePermitted:true,existingExemptionResolved:true,makeupCreditRetained:true}}));expect(api.post).toHaveBeenCalledTimes(1);expect(w.text()).toContain('This form does not debit or restore credits.');w.unmount();
 });
});
