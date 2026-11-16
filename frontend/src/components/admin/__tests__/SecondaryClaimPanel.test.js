import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
import SecondaryClaimPanel from '../SecondaryClaimPanel.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const id='11111111-1111-4111-8111-111111111111';
const proof={id,filename:'primary-eob.pdf',source:'Payer portal',uploadedByUserId:8};
const field=(w,name)=>w.findAll('label').find(label=>label.text().startsWith(name)).find('input,select');
const button=(w,name)=>w.findAll('button').find(b=>b.text()===name);
beforeEach(()=>{
 vi.clearAllMocks();api.get.mockImplementation(async path=>({data:path.endsWith('/draft')?{claim:{id:7,claim_lifecycle:'draft'},lines:[{procedure_code:'H0004',units:4,charge_cents:10000}]}:path.endsWith('/primary-proof')?{items:[]}:{adjudication:null}}));
 api.post.mockImplementation(async path=>({data:path.endsWith('/primary-proof')?{item:proof}:{claimId:11}}));
});
it('requires uploaded proof and actual adjudication before preparing an external-primary secondary draft',async()=>{
 const w=mount(SecondaryClaimPanel,{props:{agencyId:2,claimId:7}});await button(w,'Prepare / update secondary draft').trigger('click');await flushPromises();
 expect(field(w,'Where was the primary claim submitted?').element.value).toBe('external_primary');expect(button(w,'Save secondary draft for review').element.disabled).toBe(true);
 await field(w,'Where did the proof come from?').setValue('Payer portal');const file=new File(['%PDF-1.4\nSynthetic fixture'],'primary-eob.pdf',{type:'application/pdf'}),input=w.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[file],configurable:true});await input.trigger('change');await button(w,'Upload proof').trigger('click');await flushPromises();
 const upload=api.post.mock.calls[0];expect(upload[0]).toBe('/medical-billing/claims/7/primary-proof');expect(upload[1].get('file').name).toBe('primary-eob.pdf');expect(upload[2]).toEqual({params:{agencyId:2}});expect(w.text()).toContain('primary-eob.pdf');
 await field(w,'External submission system or source').setValue('TherapyNotes');await field(w,'Primary payer claim/control number').setValue('PRIMARY-123');await field(w,'ERA/EOB reference').setValue('Payer EOB issued 2026-11-16');await field(w,'Payment / adjudication date').setValue('2026-11-16');
 await button(w,'Add adjustment').trigger('click');await field(w,'Adjustment (e.g.').setValue('CO96');await field(w,'Amount ($)').setValue('100.00');
 const footer=w.findAll('.check input[type=checkbox]').slice(-2);await footer[0].setValue(true);await footer[1].setValue(true);expect(button(w,'Save secondary draft for review').element.disabled).toBe(false);await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/medical-billing/claims/7/secondary',{agencyId:2,adjudication:expect.objectContaining({source:'external_primary',externalSystem:'TherapyNotes',evidenceIds:[id],primaryClaimControlNumber:'PRIMARY-123',lines:[{paidCents:0,adjustments:[{code:'CO96',amountCents:10000}]}],attested:true,crossoverConfirmedAbsent:true})});expect(w.emitted('created')).toEqual([[11]]);w.unmount();
});
it('restores previously saved adjudication and proof selection but requires a new attestation',async()=>{
 api.get.mockImplementation(async path=>({data:path.endsWith('/draft')?{claim:{id:7,claimmd_submitted_at:'2026-11-15'},lines:[{procedure_code:'H0004',units:4,charge_cents:10000}]}:path.endsWith('/primary-proof')?{items:[proof]}:{adjudication:{source:'app_primary',primaryClaimControlNumber:'PRIMARY-123',reference:'EOB retained',paymentDate:'2026-11-16',evidenceIds:[id],lines:[{procedureCode:'H0004',units:4,paidCents:7000,adjustments:[{code:'CO45',amountCents:3000}]}]}}}));
 const w=mount(SecondaryClaimPanel,{props:{agencyId:2,claimId:7}});await button(w,'Prepare / update secondary draft').trigger('click');await flushPromises();expect(field(w,'Primary paid ($)').element.value).toBe('70.00');expect(field(w,'Primary payer claim/control number').element.value).toBe('PRIMARY-123');expect(w.findAll('.check input[type=checkbox]')[0].element.checked).toBe(true);expect(button(w,'Save secondary draft for review').element.disabled).toBe(true);w.unmount();
});
it('does not attach a delayed upload result to a different claim on screen',async()=>{
 let resolve;api.post.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const w=mount(SecondaryClaimPanel,{props:{agencyId:2,claimId:7}});await button(w,'Prepare / update secondary draft').trigger('click');await flushPromises();
 await field(w,'Where did the proof come from?').setValue('Payer portal');const input=w.find('input[type=file]');Object.defineProperty(input.element,'files',{value:[new File(['%PDF-1.4'],'old-claim.pdf')]});await input.trigger('change');await button(w,'Upload proof').trigger('click');await w.setProps({claimId:9});resolve({data:{item:proof}});await flushPromises();expect(w.text()).not.toContain('primary-eob.pdf');expect(w.find('form').exists()).toBe(false);w.unmount();
});
