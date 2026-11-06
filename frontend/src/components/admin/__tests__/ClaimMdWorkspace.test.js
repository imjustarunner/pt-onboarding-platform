import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClaimMdWorkspace from '../ClaimMdWorkspace.vue';
import { canAccessMedicalBilling } from '../../../config/medicalBillingAccess.js';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
const props = { agencyId: 1, connection: { configured: true, mode: 'test' } };
const claim = { claimId: 11, clinicalSessionId: 3, clinicalNoteId: 7, lifecycle: 'ready', reviewHash: 'a'.repeat(64),
  readiness: { ready: true, blockers: [], warnings: [] }, history: [], payload: { pat_name_f: 'Test', pat_name_l: 'Patient', payer_name: 'Test Payer', ins_number: 'SYNTHETIC', total_charge: '125.00', charge: [{ proc_code: '90834', units: '1', charge: '125.00' }] } };
const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text));

it('edits the claim billing office visibly, keeps existing charges and submits the audited selection',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/draft')?{claim:{id:11,claim_reference:'001-2026-11-001',billing_revision:2,claim_lifecycle:'ready',place_of_service:'10',billing_npi:'',rendering_npi:'2222222222',taxonomy_code:'101Y00000X'},lines:[{id:14,procedure_code:'90834',units:1,charge_cents:12500,modifiers_json:[]}],billingOffices:[{id:8,name:'Saved billing office',practice_name:'QA practice',practice_npi:'1111111111'}],billingOfficeId:null,billingOfficeError:'Select a billing office for this agency.',approvedClinicalVersion:{revisionNumber:1,dateOfService:'2026-11-01',placeOfService:'10',diagnosisCodes:['F41.1'],lines:[{procedureCode:'90834',units:1}]}}:{items:[],history:[]}}));
 api.patch.mockResolvedValue({data:{message:'Billing fields corrected.'}});
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'}});await flushPromises();await w.vm.editClaim(11);await flushPromises();
 expect(w.text()).toContain('Edit billing fields · 001-2026-11-001');expect(w.find('[aria-label="Approved clinical version for this claim"]').text()).toContain('Approved clinical version 1');
 await w.find('[data-testid="claim-billing-office"]').setValue('8');await w.find('textarea').setValue('Choose saved agency billing office');await w.find('[aria-label="Edit existing claim draft"] form').trigger('submit');await flushPromises();
 expect(api.patch).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11',expect.objectContaining({agencyId:1,billingOfficeId:8,billingNpi:'1111111111',placeOfService:'10',reason:'Choose saved agency billing office',lines:[{id:14,chargeCents:12500,modifiers:[]}]}));expect(w.emitted('updated')).toHaveLength(1);w.unmount();
});

it('offers the billing office editor directly after a missing office review error',async()=>{
 api.get.mockImplementation(async url=>{if(url.endsWith('/review'))throw {response:{data:{error:{message:'Select a billing office for this agency.'}}}};return {data:url.endsWith('/draft')?{claim:{id:11,claim_lifecycle:'draft'},lines:[],billingOffices:[]}:{items:[]}};});
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'}});await flushPromises();await w.vm.reviewClaim(11);await flushPromises();await button(w,'Select billing office').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/draft',expect.objectContaining({params:{agencyId:1}}));expect(w.text()).toContain('No billing office is configured');w.unmount();
});
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('/review') ? claim : url.endsWith('/history') ? { history: [] } : { items: [] } }));
  api.post.mockResolvedValue({ data: { message: 'Acknowledged' } });
});
describe('Claim.MD billing desk', () => {
  it('shows the complete facility name, address and effective NPI before approval', async () => {
    api.get.mockImplementation(async url => ({data:url.endsWith('/review') ? {...claim,payload:{...claim.payload,bill_npi:'1215615711',facility_npi:'1215615711',facility_name:'Verified Practice LLC',facility_addr_1:'10 Office Street',facility_addr_2:'Suite 200',facility_city:'Denver',facility_state:'CO',facility_zip:'802021234'}} : {items:[]}}));
    const w=mount(ClaimMdWorkspace,{props});await flushPromises();await w.vm.reviewClaim(11);await flushPromises();
    expect(w.text()).toContain('Service facility: Verified Practice LLC');
    expect(w.text()).toContain('NPI 1215615711');
    const facility=w.find('[aria-label="Service facility on claim"]');
    expect(facility.text()).toContain('10 Office Street · Suite 200');
    expect(facility.text()).toContain('Denver, CO 802021234');
    expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('runs an actual AI review and clears prior approval when refreshed', async () => {
    api.get.mockImplementation(async url=>({data:url.endsWith('/review')?{...claim,aiReview:{status:'required',findings:[]}}:{items:[]}}));
    const w=mount(ClaimMdWorkspace,{props});await flushPromises();await w.vm.reviewClaim(11);await flushPromises();await w.find('input[type="checkbox"]').setValue(true);
    await button(w,'Run AI consistency review').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/ai-review',{agencyId:1});expect(w.find('input[type="checkbox"]').element.checked).toBe(false);expect(button(w,'Approve and submit').attributes('disabled')).toBeDefined();w.unmount();
  });
  it('requires agency billing permission and always hides billing from provider roles', () => {
    expect(canAccessMedicalBilling({ role: 'provider', billingAgencyIds: [1] }, 1)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'provider_plus', billingAgencyIds: [1] }, 1)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'support', billingAgencyIds: [1] }, 1)).toBe(true);
    expect(canAccessMedicalBilling({ role: 'support', billingAgencyIds: [1] }, 2)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'admin' }, 1)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'admin', billingAgencyIds: [1] }, 1)).toBe(true);
  });
  it('requires explicit approval and submits the reviewed hash and account mode', async () => {
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    await w.vm.reviewClaim(11); await flushPromises();
    expect(w.text()).toContain('Test Patient');
    expect(button(w, 'Approve and submit').attributes('disabled')).toBeDefined();
    await w.find('input[type="checkbox"]').setValue(true);
    await button(w, 'Approve and submit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/submit', { agencyId: 1, approved: true, reviewHash: 'a'.repeat(64), accountMode: 'test' });
    expect(w.text()).toContain('Acknowledged'); expect(w.emitted('updated')).toHaveLength(1); w.unmount();
  });
  it('records a practice submit for a demo connection without a clearinghouse mode', async () => {
    const w = mount(ClaimMdWorkspace, { props: { ...props, connection: { configured: false, mode: 'disabled', practiceSubmission: true } } }); await flushPromises();
    await w.vm.reviewClaim(11); await flushPromises();
    expect(w.text()).toContain('Nothing is sent to Claim.MD or a payer.');
    expect(button(w, 'Approve practice submit').attributes('disabled')).toBeDefined();
    await w.find('input[type="checkbox"]').setValue(true);
    await button(w, 'Approve practice submit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/submit', { agencyId: 1, approved: true, reviewHash: 'a'.repeat(64), accountMode: 'disabled' });
    w.unmount();
  });
  it('cannot submit when transmission is disabled', async () => {
    const w = mount(ClaimMdWorkspace, { props: { ...props, connection: { configured: true, mode: 'disabled' } } }); await flushPromises();
    await w.vm.reviewClaim(11); await flushPromises();
    await w.find('input[type="checkbox"]').setValue(true);
    expect(button(w, 'Approve and submit').attributes('disabled')).toBeDefined();
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('does not issue an automatic retry after an uncertain submission', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Reconcile before retrying' } } } });
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises(); await w.vm.reviewClaim(11); await flushPromises();
    await w.find('input[type="checkbox"]').setValue(true); await button(w, 'Approve and submit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1); expect(w.text()).toContain('Reconcile before retrying'); w.unmount();
  });
  it('discards a pending claim review after leaving the agency workspace', async () => {
    let resolve; const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    api.get.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = w.vm.reviewClaim(11); w.unmount(); resolve({ data: claim }); await pending; await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('requires a saved billing office and sends its ID instead of a typed NPI', async () => {
    api.get.mockImplementation(async url => ({ data: url.endsWith('/billing-offices') ? { items: [{ id: 8, name: 'Windchime', practice_name: 'Test Group', practice_npi: '1306688650' }] } : url.endsWith('/payers') ? { payers: [{ payerid: 'COCHA', payer_name: 'CCHA' }] } : { items: [] } }));
    const popup = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    api.post.mockResolvedValue({ data: { url: 'https://www.claim.md/enroll/example/' } });
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    await w.find('[data-testid="payer-directory-search"] input').setValue('Colorado');
    await w.find('[data-testid="payer-directory-search"]').trigger('submit'); await flushPromises();
    expect(button(w, 'Open enrollment').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="billing-office"]').setValue('8');
    await button(w, 'Open enrollment').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/enrollments', { agencyId: 1, payerId: 'COCHA', billingOfficeLocationId: 8, enrollmentType: '1500', acknowledgeEraRouting: false });
    expect(popup.location.replace).toHaveBeenCalledWith('https://www.claim.md/enroll/example/');
    expect(popup.opener).toBeNull(); w.unmount(); open.mockRestore();
  });
});

it('shows payer setup capabilities without calling them connected and searches the exact ID', async () => {
  api.get.mockImplementation(async url => ({data: url.endsWith('/payer-setup-requests') ? {items:[{
    id:5,payer_name:'CO BCBS',claimmd_payer_id:'00050',source_payer_id:'00050',directory_name:'CO BCBS',directory_status:'id_match',
    source_names_json:['CO BCBS','Blue Cross Blue Shield of Colorado'],directory_snapshot_json:{'1500_claims':'yes',era:'enrollment',eligibility:'no'}
  }]} : url.endsWith('/billing-offices') ? {items:[{id:8,name:'Office',practice_npi:'1306688650'}]} : url.endsWith('/payers') ? {payers:[{payerid:'00050',payer_name:'CO BCBS'}]} : {items:[]}}));
  const w=mount(ClaimMdWorkspace,{props:{...props,section:'payers',connection:{configured:true,mode:'disabled'}}});await flushPromises();
  expect(w.text()).toContain('Directory availability is not enrollment');
  expect(w.text()).toContain('Enrollment required');expect(w.text()).toContain('Not available');expect(w.text()).toContain('Blue Cross Blue Shield of Colorado');
  await button(w,'Review route').trigger('click');await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/medical-billing/claimmd/payers',{params:{agencyId:1,payerId:'00050'}});
  await w.find('[data-testid="billing-office"]').setValue(8);
  expect(button(w,'Open enrollment').attributes('disabled')).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('adds the selected directory ID to the current agency without starting enrollment',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/payers')?{payers:[{payerid:'00050',payer_name:'CO BCBS'}]}:{items:[]}}));
 api.post.mockResolvedValue({data:{items:[{id:1,payer_name:'CO BCBS',claimmd_payer_id:'00050',directory_status:'id_match'}]}});
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'payers'}});await flushPromises();
 await w.find('[data-testid="payer-directory-search"] select').setValue('id');
 await w.find('[data-testid="payer-directory-search"] input').setValue('00050');
 await w.find('[data-testid="payer-directory-search"]').trigger('submit');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/claimmd/payers',{params:{agencyId:1,payerId:'00050'}});
 await button(w,'Add to agency').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/payer-setup-requests',{agencyId:1,payerId:'00050'});
 expect(w.text()).toContain('Open enrollment to complete');w.unmount();
});
it('continues the existing group enrollment across offices and blocks unsupported transactions',async()=>{
 const offices=[{id:8,name:'First',practice_npi:'1306688650'},{id:9,name:'Second',practice_npi:'1306688650'}];
 api.get.mockImplementation(async url=>({data:url.endsWith('/billing-offices')?{items:offices}:url.endsWith('/enrollments')?{items:[{id:1,billing_office_location_id:8,provider_npi:'1306688650',payer_id:'COCHA',enrollment_type:'1500',status:'started'}]}:url.endsWith('/payers')?{payers:[{payerid:'COCHA',payer_name:'CCHA','1500_claims':'enrollment',era:'no'}]}:{items:[]}}));
 const popup={location:{replace:vi.fn()},close:vi.fn()};const open=vi.spyOn(window,'open').mockReturnValue(popup);
 api.post.mockResolvedValue({data:{url:'https://www.claim.md/enroll/example/'}});
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'payers'}});await flushPromises();
 await w.find('[data-testid="payer-directory-search"] input').setValue('CCHA');await w.find('[data-testid="payer-directory-search"]').trigger('submit');await flushPromises();
 await w.find('[data-testid="billing-office"]').setValue(9);
 expect(w.text()).toContain('2 offices share this group NPI');
 await button(w,'Continue enrollment').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/enrollments',expect.objectContaining({billingOfficeLocationId:8}));
 const transaction=w.findAll('select').find(s=>s.find('option[value="era"]').exists());await transaction.setValue('era');
 await w.find('input[type="checkbox"]').setValue(true);
 expect(button(w,'Open enrollment').attributes('disabled')).toBeDefined();
 w.unmount();open.mockRestore();
});

describe('approved clinical version reconciliation into an existing unsent draft',()=>{
 const approved=()=>({revisionId:901,revisionNumber:2,contentHash:'DEMO-QA-approved-clinical-hash',dateOfService:'2026-11-01',placeOfService:'10',diagnosisCodes:['F41.1','Z63.0'],lines:[{procedureCode:'90834',units:1},{procedureCode:'90785',units:1}],signatures:[],pendingClinicalApproval:false});
 const snapshot=(overrides={})=>({claim:{id:11,billing_revision:4,claim_lifecycle:'draft',place_of_service:'11',billing_npi:'1234567890',rendering_npi:'1234567890',taxonomy_code:'101YM0800X'},lines:[{id:31,procedure_code:'90832',units:1,charge_cents:12500,modifiers_json:'[]',diagnosis_pointers:'1'}],approvedClinicalVersion:approved(),clinicalVersionChanged:true,previouslyTransmitted:false,...overrides});
 async function openDraft(data=snapshot()){
  api.get.mockImplementation(async url=>({data:url.endsWith('/draft')?data:url.endsWith('/history')?{history:[]}:{items:[]}}));
  const wrapper=mount(ClaimMdWorkspace,{props:{...props,section:'detail'}});await wrapper.vm.editClaim(11);await flushPromises();return wrapper;
 }
 const field=(wrapper,id)=>wrapper.get(`[data-testid="${id}"]`);
 async function fillReview(wrapper){
  await field(wrapper,'review-approved-version').trigger('click');
  await field(wrapper,'reconcile-charge-0').setValue('125.00');await field(wrapper,'reconcile-modifiers-0').setValue('GT');await field(wrapper,'reconcile-pointers-0').setValue('1,2');
  await field(wrapper,'reconcile-charge-1').setValue('20.00');await field(wrapper,'reconcile-pointers-1').setValue('1');await field(wrapper,'reconcile-reason').setValue('DEMO QA reconcile approved clinical services.');
  await field(wrapper,'reconcile-attestation').setValue(true);
 }
 it('reviews every approved line and updates the same draft with exact billing and clinical versions, without submission',async()=>{
  api.patch.mockResolvedValue({data:{ok:true,message:'Existing draft reconciled. No claim was transmitted.',clinicalVersion:{revisionId:901,contentHash:'DEMO-QA-approved-clinical-hash'}}});
  const wrapper=await openDraft();expect(wrapper.text()).toContain('Approved clinical version 2');expect(wrapper.text()).toContain('90834');expect(wrapper.text()).toContain('F41.1');
  await field(wrapper,'review-approved-version').trigger('click');expect(field(wrapper,'reconcile-charge-0').element.value).toBe('');expect(field(wrapper,'reconcile-pointers-0').element.value).toBe('');expect(field(wrapper,'apply-approved-version').element.disabled).toBe(true);
  await field(wrapper,'reconcile-charge-0').setValue('125.00');await field(wrapper,'reconcile-modifiers-0').setValue('gt');await field(wrapper,'reconcile-pointers-0').setValue('1,2');await field(wrapper,'reconcile-charge-1').setValue('20');await field(wrapper,'reconcile-pointers-1').setValue('1');await field(wrapper,'reconcile-reason').setValue('DEMO QA reconcile approved clinical services.');await field(wrapper,'reconcile-attestation').setValue(true);
  await field(wrapper,'clinical-reconciliation-form').trigger('submit');await flushPromises();
  expect(api.patch).toHaveBeenCalledExactlyOnceWith('/medical-billing/claimmd/claims/11',{agencyId:1,action:'reconcile_approved_version',revision:4,expectedClinicalRevisionId:901,expectedClinicalContentHash:'DEMO-QA-approved-clinical-hash',reason:'DEMO QA reconcile approved clinical services.',attested:true,lines:[{procedureCode:'90834',units:1,chargeCents:12500,modifiers:['GT'],diagnosisPointers:'1,2'},{procedureCode:'90785',units:1,chargeCents:2000,modifiers:[],diagnosisPointers:'1'}]},{skipGlobalLoading:true});
  expect(api.post).not.toHaveBeenCalled();expect(wrapper.emitted('updated')).toHaveLength(1);expect(wrapper.find('[data-testid="clinical-reconciliation-form"]').exists()).toBe(false);expect(wrapper.text()).toContain('No claim was transmitted');wrapper.unmount();
 });
 it('requires valid explicit charges, diagnosis positions, reason and renewed attestation after editing',async()=>{
  const wrapper=await openDraft();await fillReview(wrapper);expect(field(wrapper,'apply-approved-version').element.disabled).toBe(false);
  await field(wrapper,'reconcile-pointers-0').setValue('3');expect(field(wrapper,'reconcile-attestation').element.checked).toBe(false);await field(wrapper,'reconcile-attestation').setValue(true);expect(field(wrapper,'apply-approved-version').element.disabled).toBe(true);
  await field(wrapper,'reconcile-pointers-0').setValue('1');await field(wrapper,'reconcile-charge-1').setValue('0');await field(wrapper,'reconcile-attestation').setValue(true);expect(field(wrapper,'apply-approved-version').element.disabled).toBe(true);
  await field(wrapper,'reconcile-charge-1').setValue('20');await field(wrapper,'reconcile-reason').setValue('short');await field(wrapper,'reconcile-attestation').setValue(true);expect(field(wrapper,'apply-approved-version').element.disabled).toBe(true);expect(api.patch).not.toHaveBeenCalled();wrapper.unmount();
 });
 it.each(['pending','transmitted','queued'])('blocks %s claims from clinical version reconciliation',async state=>{
  const data=snapshot(state==='pending'?{approvedClinicalVersion:{...approved(),pendingClinicalApproval:true,pendingRevisionId:902}}:state==='transmitted'?{previouslyTransmitted:true}:{claim:{...snapshot().claim,claim_lifecycle:'queued'}});
  const wrapper=await openDraft(data);expect(field(wrapper,'review-approved-version').element.disabled).toBe(true);await field(wrapper,'review-approved-version').trigger('click');expect(wrapper.find('[data-testid="clinical-reconciliation-form"]').exists()).toBe(false);expect(api.patch).not.toHaveBeenCalled();wrapper.unmount();
 });
 it('keeps the draft after a stale version conflict, clears attestation and requires reopening',async()=>{
  api.patch.mockRejectedValue({response:{status:409,data:{error:{message:'DEMO QA approved clinical version changed. Reopen the draft.'}}}});
  const wrapper=await openDraft();await fillReview(wrapper);await field(wrapper,'clinical-reconciliation-form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('clinical version changed');expect(field(wrapper,'reconcile-attestation').element.checked).toBe(false);expect(field(wrapper,'apply-approved-version').element.disabled).toBe(true);expect(wrapper.emitted('updated')).toBeUndefined();expect(Number(field(wrapper,'reconcile-charge-0').element.value)).toBe(125);wrapper.unmount();
 });
 it('never reports success without exact server confirmation',async()=>{
  api.patch.mockResolvedValue({data:{ok:true}});const wrapper=await openDraft();await fillReview(wrapper);await field(wrapper,'clinical-reconciliation-form').trigger('submit');await flushPromises();expect(wrapper.text()).toContain('did not confirm');expect(wrapper.emitted('updated')).toBeUndefined();expect(wrapper.find('[data-testid="clinical-reconciliation-form"]').exists()).toBe(true);wrapper.unmount();
 });
});

it('opens incomplete claims with actionable dated checks and refreshes after insurance saves without submitting',async()=>{
 const incomplete={...claim,clientId:7,dateOfService:'2026-11-02',payload:null,readiness:{ready:false,blockers:['Claim is incomplete: payerid'],warnings:[],payloadIssue:{message:'Claim is incomplete: payerid'},coverageVerified:false,insuranceIdentityVerified:false,clientDocumentation:{scope:'screening',ready:false}},aiReview:{status:'required',findings:[]}};
 api.get.mockImplementation(async url=>({data:url.endsWith('/review')?incomplete:{items:[]}}));
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'},global:{stubs:{ClientInsuranceEditor:{props:['clientId','agencyId','showRelatedReviews'],emits:['saved'],template:'<button data-testid="save-insurance" @click="$emit(\'saved\')">Save synthetic insurance</button>'},ClientCoverageVerification:true,ClientDocumentationReadiness:true}}});await flushPromises();await w.vm.reviewClaim(11);await flushPromises();
 expect(w.text()).toContain('Complete review for service date 11/02/2026');expect(button(w,'Approve and submit').attributes('disabled')).toBeDefined();expect(button(w,'Run AI consistency').attributes('disabled')).toBeDefined();
 await button(w,'Coverage for').trigger('click');expect(w.findComponent({name:'ClientCoverageVerification'}).props()).toMatchObject({clientId:7,agencyId:1,serviceDate:'2026-11-02'});
 await button(w,'Screening documents').trigger('click');expect(w.findComponent({name:'ClientDocumentationReadiness'}).props()).toMatchObject({scope:'screening',serviceDate:'2026-11-02'});
 await button(w,'Insurance & identity').trigger('click');await w.find('[data-testid="save-insurance"]').trigger('click');await flushPromises();expect(api.get.mock.calls.filter(([url])=>url.endsWith('/review'))).toHaveLength(2);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('shows the recorded history actor and Denver date/time',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/history')?{history:[{id:1,type:'correction',createdAt:'2026-11-04T20:17:33.000Z',actorUserId:9,actorName:'QA Biller',reason:'Modifier reviewed'}]}:{items:[]}}));
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'}});await flushPromises();await w.vm.showHistory(11);await flushPromises();expect(w.text()).toContain('QA Biller');expect(w.text()).toContain('11/04/2026, 1:17 PM MST');expect(w.text()).not.toContain('2026-11-04T20:17');w.unmount();
});

it('opens the exact missing review from each blocker, explains saved date/stage mismatches, and refreshes completed checks', async () => {
 const coverage='Verify insurance and coordination of benefits for this date of service', documents='Review and verify the applicable screening documentation before claim submission', ai='Run the AI content and claim consistency review', policy='Verify the payer/product provider mapping for this date of service';
 let current={...claim,clientId:7,dateOfService:'2026-11-02',supervision:{supervisingProvider:{id:22}},aiReview:{status:'required',findings:[]},readiness:{ready:false,blockers:[coverage,documents,ai,policy],warnings:['No active treatment plan on chart'],coverageBlockers:[coverage],coverageReview:{latest:{status:'verified',serviceDate:'2026-11-04'}},payer:{payerId:'QA-PAYER',planType:''},clientDocumentation:{scope:'screening',ready:false,blockers:[documents],latestReview:{scope:'treatment',status:'verified',effectiveFrom:'2026-11-04'}}}};
 api.get.mockImplementation(async url=>({data:url.endsWith('/review')?current:{items:[]}}));
 const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'},attachTo:document.body,global:{stubs:{ClientInsuranceEditor:true,ClientCoverageVerification:{name:'ClientCoverageVerification',props:['clientId','agencyId','serviceDate'],emits:['saved'],template:'<button data-testid="save-coverage" @click="$emit(\'saved\')">Save coverage review</button>'},ClientDocumentationReadiness:true,SupervisedPayerPolicies:true}}});
 await w.vm.reviewClaim(11);await flushPromises();
 const checklist=()=>w.get('[aria-label="Remaining claim requirements"]');
 expect(checklist().findAll('button')[0].text()).toBe('Add verified insurance plan type');expect(checklist().findAll('button').at(-1).text()).toBe('Open AI consistency review');
 expect(checklist().text()).toContain('verified coverage review exists for 11/04/2026');expect(checklist().text()).toContain('saved treatment review covers 11/04/2026 onward');
 expect(checklist().text()).not.toContain('No active treatment plan');expect(w.get('[aria-label="Claim advisories"]').text()).toContain('these do not block submission');
 await button(checklist(),'Verify coverage for').trigger('click');await flushPromises();
 expect(w.findComponent({name:'ClientCoverageVerification'}).props('serviceDate')).toBe('2026-11-02');expect(document.activeElement.getAttribute('aria-label')).toBe('Coverage for this service date');expect(scroll).toHaveBeenCalled();
 await button(checklist(),'Review screening documents').trigger('click');await flushPromises();expect(w.findComponent({name:'ClientDocumentationReadiness'}).props('scope')).toBe('screening');
 await button(checklist(),'Open AI').trigger('click');await flushPromises();expect(document.activeElement.getAttribute('aria-label')).toBe('AI content review');expect(api.post).not.toHaveBeenCalled();
 await button(checklist(),'Add verified insurance plan type').trigger('click');await flushPromises();expect(w.findComponent({name:'ClientInsuranceEditor'}).exists()).toBe(true);
 current={...current,readiness:{...current.readiness,payer:{payerId:'QA-PAYER',planType:'Verified QA plan'}}};await button(w,'Refresh claim requirements').trigger('click');await flushPromises();
 await button(checklist(),'Configure payer/provider mapping').trigger('click');await flushPromises();expect(w.findComponent({name:'SupervisedPayerPolicies'}).props()).toMatchObject({agencyId:1,payerId:'QA-PAYER',planType:'Verified QA plan'});
 await button(checklist(),'Verify coverage for').trigger('click');await flushPromises();
 current={...current,aiReview:{status:'passed',findings:[]},readiness:{...current.readiness,blockers:[documents,policy],coverageBlockers:[],coverageVerified:true}};
 await w.get('[data-testid="save-coverage"]').trigger('click');await flushPromises();expect(checklist().text()).not.toContain(coverage);expect(checklist().text()).not.toContain(ai);expect(w.text()).toContain('2 requirements remain');expect(w.text()).toContain('AI consistency review completed');expect(button(w,'Approve and submit').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();
 w.unmount();delete Element.prototype.scrollIntoView;
});
it('preserves an unrecognized blocker and never offers an action that clears it locally',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/review')?{...claim,clientId:7,dateOfService:'2026-11-02',readiness:{ready:false,blockers:['Supervisor requested documentation changes; obtain review after the amendment'],warnings:[]}}:{items:[]}}));
 const w=mount(ClaimMdWorkspace,{props:{...props,section:'detail'}});await w.vm.reviewClaim(11);await flushPromises();expect(w.get('[aria-label="Remaining claim requirements"]').text()).toContain('Supervisor requested');expect(w.get('[aria-label="Remaining claim requirements"]').findAll('button')).toHaveLength(0);expect(button(w,'Approve and submit').element.disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('shows one numbered claim with chronological attempts, field changes and payer payments, and loads earlier history',async()=>{
 const meta={claimReference:'002-2026-11-009',patientControlNumber:'12',attempts:[{id:11,number:1,lifecycle:'rejected',payerReference:'11'},{id:13,number:2,lifecycle:'paid',payerReference:'12'}]};
 api.get.mockImplementation(async(url,options)=>({data:url.endsWith('/history')?{...meta,nextBefore:options.params.before?null:3,history:options.params.before?[{id:1,type:'approved_submission',attemptNumber:1}]:[{id:3,type:'correction',attemptNumber:2,actorName:'DEMO Biller',before:{billingNpi:'111',lines:[{id:4,charge_cents:2500,modifiers_json:[]}]},after:{billingNpi:'222',lines:[{id:4,chargeCents:3000,modifiers:['U9']}]}},{id:4,type:'remittance_posted',attemptNumber:2,paidCents:2000,adjustmentCents:1000,responsibilityCents:0,payerControlNumber:'PAYER-123'}]}:{items:[]}}));
 const w=mount(ClaimMdWorkspace,{props:{agencyId:2,connection:{configured:true,mode:'test'},section:'claims'}});await flushPromises();await w.vm.showHistory(13);await flushPromises();
 const history=w.find('[aria-label="Claim history"]');expect(history.text()).toContain('002-2026-11-009');expect(history.text()).toContain('Earlier payer reference: 12');expect(history.text()).toContain('Line 1 charge: $25.00 → $30.00');expect(history.text()).toContain('Line 1 modifiers: None → U9');expect(history.text()).toContain('Paid $20.00');expect(history.text()).toContain('DEMO Biller');
 await history.find('button').trigger('click');await flushPromises();expect(history.findAll('article').map(a=>a.text())).toEqual([expect.stringContaining('Submitted'),expect.stringContaining('Billing fields updated'),expect.stringContaining('Payer adjudication posted')]);expect(history.find('button').exists()).toBe(false);w.unmount();
});
