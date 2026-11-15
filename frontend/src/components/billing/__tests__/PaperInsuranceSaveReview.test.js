import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../store/auth.js',()=>({useAuthStore:()=>({user:{id:42,role:'staff'}})}));
vi.mock('../../../config/medicalBillingAccess.js',()=>({canAccessMedicalBilling:()=>true}));
import api from '../../../services/api.js';
import ClientInsuranceEditor from '../ClientInsuranceEditor.vue';
import InsurancePolicyFields from '../InsurancePolicyFields.vue';
let w,state;
const patient={firstName:'Sam',lastName:'Fixture',dateOfBirth:'2023-09-20',state:'CO'};
const primary=()=>({insurerName:'CHAMPVA',memberId:'605000000-00',relationshipToSubscriber:'child',subscriberFirstName:'Alex',subscriberLastName:'Fixture',subscriberDob:'1980-01-01',paperSubscriberName:'Alex Fixture'});
beforeEach(()=>{
 vi.clearAllMocks();state={insurance:{primary:primary(),patient,paperReviewRequired:true,paperSourceDocumentId:9},demographics:patient,payers:[{id:13,name:'CHAMPVA HAC',names:['CHAMPVA','CHAMPVA HAC'],payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false},{id:19,name:'Colorado Medicaid',names:['Colorado Medicaid'],payerId:'COCHA',eligibilityPayerId:'SKCO0',isMedicaid:true}],paperCoverage:{primary:primary(),secondary:{insurerName:'Colorado Medicaid',memberId:'A123456',paperSubscriberName:'Alex Fixture',paperReportedMemberId:'A123456',relationshipToSubscriber:'self',subscriberFirstName:'Sam',subscriberLastName:'Fixture'}},eligibilityFindings:[{id:1,slot:'primary',status:'error',isCurrent:false,identityMatches:null,response:null,otherInsurers:[]}],eligibilityStatus:{reviewed:false,policies:[{slot:'primary',status:'awaiting_review'}]}};
 api.get.mockImplementation(async()=>({data:structuredClone(state)}));api.put.mockImplementation(async(path,body)=>{state.insurance={...JSON.parse(JSON.stringify(body)),paperReviewRequired:true,paperSourceDocumentId:9,paperDraftSaved:true,...(body.paperReviewConfirmed?{paperReview:{reviewedAt:'2026-11-15T12:00:00Z'}}:{paperReview:null})};state.eligibilityStatus={reviewed:body.paperReviewConfirmed,jobStatus:body.paperReviewConfirmed?'pending':null,policies:[{slot:'primary',status:body.paperReviewConfirmed?'queued':'awaiting_review'}]};return {data:{insurance:structuredClone(state.insurance),automaticEligibility:{status:body.paperReviewConfirmed?'queued':'awaiting_paper_review'}}};});
});
afterEach(()=>w?.unmount());
async function render(){w=mount(ClientInsuranceEditor,{props:{clientId:4,agencyId:2,paperEntry:true,paperDocumentId:9,startOpen:true,assignmentReview:true,showRelatedReviews:false}});await flushPromises();return w;}
function editPrimary(memberId){const fields=w.findAllComponents(InsurancePolicyFields)[0];fields.vm.$emit('update:modelValue',{...fields.props('modelValue'),memberId});}
it('shows the corrected number in one current draft while retaining the uncorrected source behind a disclosure',async()=>{
 await render();editPrimary('005000000-00');await flushPromises();const summary=w.get('[aria-label="Current paper insurance details"]');expect(summary.text()).toContain('005000000-00');expect(summary.text()).not.toContain('605000000-00');
 const original=w.get('[aria-label="Original insurance reader output"]');expect(original.attributes('open')).toBeUndefined();expect(original.text()).toContain('605000000-00');expect(w.text()).not.toContain('Use packet primary details');expect(w.findAllComponents(ClientInsuranceEditor)).toHaveLength(0);
 const secondary=w.findAllComponents(InsurancePolicyFields)[1].props('modelValue');expect(secondary).toMatchObject({memberId:'',paperReportedMemberId:'A123456',relationshipToSubscriber:'self',subscriberFirstName:'Sam'});
});
it('saves processor drafts without any separate insurance confirmation or eligibility action',async()=>{
 await render();expect(w.find('.paper-transcription-confirmation').exists()).toBe(false);expect(w.text()).not.toContain('Confirm details & check coverage');expect(w.text()).not.toContain('Save corrections & check coverage');
 await w.get('form').trigger('submit');await flushPromises();expect(api.put.mock.calls[0][1]).toMatchObject({paperReviewConfirmed:false,checkCoverage:false,paperDocumentId:9,verifiedForClaims:false});expect(w.get('[role="status"]').text()).toContain('No payer request was sent');expect(w.text()).toContain('Submitting the completed packet');
});
it('saves corrected current fields on continue without authorizing eligibility, even with an obsolete confirmation option',async()=>{
 await render();editPrimary('005000000-00');await flushPromises();expect(await w.vm.save({paperEntry:true,confirmPaper:true})).toMatchObject({saved:true});expect(api.put.mock.calls[0][1]).toMatchObject({paperReviewConfirmed:false,checkCoverage:false,primary:{memberId:'005000000-00',payerId:'84146'},secondary:{memberId:'',paperReportedMemberId:'A123456'}});
 expect(w.get('[aria-label="Current paper insurance details"]').text()).not.toContain('Eligibility check queued');editPrimary('005000001-00');await flushPromises();expect(await w.vm.save({paperEntry:true})).toMatchObject({saved:true});expect(api.put).toHaveBeenCalledTimes(2);
});
it('keeps failed no-response attempts in collapsed history without calling them identity mismatches',async()=>{
 await render();const history=w.get('[aria-label="Information returned by insurers"]');expect(history.attributes('open')).toBeUndefined();expect(history.text()).toContain('No payer response was saved');expect(history.text()).not.toContain('Returned identity needs reconciliation');
});
it('names missing eligibility inputs without sending an additional request on refresh',async()=>{
 await render();await w.vm.save({paperEntry:true});state.eligibilityStatus={reviewed:true,jobStatus:'review_required',policies:[{slot:'primary',status:'needs_details',missingFields:['subscriber birth date']},{slot:'secondary',status:'not_checked'}]};await w.findAll('button').find(button=>button.text()==='Refresh saved verification status').trigger('click');await flushPromises();expect(w.get('[aria-label="Current paper insurance details"]').text()).toContain('Not checked — needs subscriber birth date');expect(api.put).toHaveBeenCalledTimes(1);
});
it('prepares CHAMPVA first and Medicaid second for the recognisable old reversed single-policy import',async()=>{
 state.insurance.primary={insurerName:'Colorado Community Health Alliance',memberId:'A123456',payerId:'COCHA',isMedicaid:true};await render();const policies=w.findAllComponents(InsurancePolicyFields).map(field=>field.props('modelValue'));expect(policies[0]).toMatchObject({payerId:'84146',memberId:'605000000-00'});expect(policies[1]).toMatchObject({isMedicaid:true,memberId:'',paperReportedMemberId:'A123456'});expect(api.put).not.toHaveBeenCalled();
});

it('allows billing to save corrections and recheck only after packet submission',async()=>{
 state.insurance.paperFinalizedAt='2026-11-15T12:00:00Z';w=mount(ClientInsuranceEditor,{props:{clientId:4,agencyId:2,paperDocumentId:9,startOpen:true,assignmentReview:true,showRelatedReviews:false}});await flushPromises();
 await w.findAll('button').find(button=>button.text()==='Save corrections & check coverage').trigger('click');await flushPromises();expect(api.put.mock.calls[0][1]).toMatchObject({checkCoverage:true,paperReviewConfirmed:false});
});
