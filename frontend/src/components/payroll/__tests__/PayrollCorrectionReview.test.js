import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Review from '../PayrollCorrectionReview.vue';
import Details from '../PayrollAdjustmentDetails.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
const props={destinationPeriodId:12,sourcePeriodId:11,baselineRowId:1,compareRowId:2};
const quote=()=>({provider:'Test Provider',client:'Example',serviceDate:'2026-10-21',original:{code:'90837',units:1,noteStatus:'FINALIZED',periodStart:'2026-10-10',periodEnd:'2026-10-23',postedAt:'2026-10-27T12:00:00Z',baseAmount:30,autoIndirectAmount:0,total:30},corrected:{code:'H0004',units:3,noteStatus:'FINALIZED',baseAmount:21,autoIndirectAmount:0,total:21},reductionAmount:9,additionalPayAmount:0,adjustmentAmount:-9,adjustmentType:'reduction',canPostAdjustment:true,canPostReduction:true,reviewToken:'signed-review',blockers:[],calculationBasis:'Pay adjustment only.'});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:quote()});api.post.mockResolvedValue({data:{adjustmentId:22}});});
const mountReview=()=>mount(Review,{props,global:{stubs:{Teleport:true}}});
it('shows the original payroll, source session and net pay difference before posting only the reduction',async()=>{
 const w=mountReview();await flushPromises();expect(w.text()).toContain('2026-10-10 → 2026-10-23');expect(w.text()).toContain('90837');expect(w.text()).toContain('H0004');expect(w.text()).toContain('-$9.00');
 await w.findAll('button').find(b=>b.text()==='Post reduction').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/payroll/periods/12/correction-review/reduction',{sourcePayrollPeriodId:11,baselineRowId:1,compareRowId:2,reviewToken:'signed-review'});expect(w.emitted('posted')[0][0]).toMatchObject({adjustmentId:22});w.unmount();
});
it('blocks unknown amounts and already posted corrections',async()=>{
 api.get.mockResolvedValue({data:{...quote(),original:{...quote().original,total:null},reductionAmount:null,canPostAdjustment:false,canPostReduction:false,blockers:['Original payment cannot be confirmed']}});const w=mountReview();await flushPromises();expect(w.text()).toContain('Not confirmed');expect(w.findAll('button').find(b=>b.text()==='Post reduction').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('requires a fresh review after a stale or failed post',async()=>{
 api.post.mockRejectedValue({response:{data:{error:{message:'The session changed. Review again.'}}}});const w=mountReview();await flushPromises();await w.findAll('button').find(b=>b.text()==='Post reduction').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toContain('session changed');expect(w.findAll('button').find(b=>b.text()==='Post reduction').element.disabled).toBe(true);expect(w.emitted('posted')).toBeUndefined();w.unmount();
});
it('keeps the source-period and reason details clickable on a saved adjustment',async()=>{
 const w=mount(Details,{props:{label:'Overpayment reduction: -$9.00',details:[{label:'Original payroll period',value:'2026-10-10 → 2026-10-23'},{label:'Reason',value:'90837 corrected to H0004'}]}});expect(w.get('summary').text()).toContain('Overpayment reduction');expect(w.text()).toContain('90837 corrected to H0004');w.unmount();
});

it('shows underpayment and posts additional pay through its own reviewed action',async()=>{
 api.get.mockResolvedValue({data:{...quote(),corrected:{...quote().corrected,total:45,baseAmount:45},reductionAmount:0,additionalPayAmount:15,adjustmentAmount:15,adjustmentType:'additional_pay',canPostAdjustment:true,canPostReduction:false,canPostAdditionalPay:true}});
 const w=mountReview();await flushPromises();expect(w.text()).toContain('Underpayment');expect(w.text()).toContain('$15.00');await w.findAll('button').find(b=>b.text()==='Post additional pay').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/payroll/periods/12/correction-review/additional-pay',expect.objectContaining({reviewToken:'signed-review'}));w.unmount();
});

it('shows no pay change without offering either financial action',async()=>{
 api.get.mockResolvedValue({data:{...quote(),reductionAmount:0,additionalPayAmount:0,adjustmentAmount:0,adjustmentType:'none',canPostAdjustment:false,canPostReduction:false,blockers:['The service pay is unchanged. No pay adjustment is needed.']}});const w=mountReview();await flushPromises();expect(w.text()).toContain('No pay adjustment is needed');expect(w.findAll('button').some(b=>b.text().startsWith('Post '))).toBe(false);w.unmount();
});

it.each(['reduction','additional_pay'])('requires an attestation and reason before saving a %s waiver',async adjustmentType=>{
 api.get.mockResolvedValue({data:{...quote(),adjustmentType,canWaive:true}});api.post.mockResolvedValue({data:{resolutionId:9}});
 const w=mountReview();await flushPromises();await w.findAll('button').find(b=>b.text()===(adjustmentType==='reduction'?'Waive reduction':'Waive additional pay')).trigger('click');
 expect(w.text()).toContain('Are you sure?');expect(w.text()).toContain('Your signed-in account will be identified');const confirm=w.findAll('button').find(b=>b.text()==='Confirm waiver');expect(confirm.element.disabled).toBe(true);
 await w.get('textarea').setValue('Discussed and waived.');expect(confirm.element.disabled).toBe(true);await w.get('input[type=checkbox]').setValue(true);await flushPromises();const readyConfirm=w.findAll('button').find(b=>b.text()==='Confirm waiver');expect(readyConfirm.element.disabled).toBe(false);await readyConfirm.trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/payroll/periods/12/correction-review/resolve',expect.objectContaining({resolution:'waived',confirmed:true,reason:'Discussed and waived.',reviewToken:'signed-review'}));expect(w.emitted('posted')[0][0].resolutionId).toBe(9);w.unmount();
});
it('can cancel a waiver without recording any decision',async()=>{
 api.get.mockResolvedValue({data:{...quote(),canWaive:true}});const w=mountReview();await flushPromises();await w.findAll('button').find(b=>b.text()==='Waive reduction').trigger('click');await w.findAll('button').find(b=>b.text()==='Cancel waiver').trigger('click');expect(w.find('textarea').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('explains when payment inclusion is confirmed but the exact amount remains unresolved',async()=>{
 api.get.mockResolvedValue({data:{...quote(),original:{...quote().original,paymentConfirmed:true,amountConfirmed:false,total:null},canPostAdjustment:false}});const w=mountReview();await flushPromises();expect(w.text()).toContain('Payment inclusion confirmed');w.unmount();
});
