import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import SchoolPaperPacketWorkflow from '../SchoolPaperPacketWorkflow.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),patch:vi.fn()}}));
vi.mock('../../documents/PDFPreview.vue',()=>({default:{props:['pdfUrl'],template:'<div data-test="packet">{{pdfUrl}}</div>'}}));
const saveInsurance=vi.fn(),saveRoi=vi.fn(),pendingRoi=vi.fn(),reloadRoi=vi.fn();
let context,w;
const steps=['demographics','guardian1','guardian2','school','insurance'];
const guardian=(id)=>({guardian_user_id:id,first_name:'Synthetic',last_name:`Parent ${id}`,email:`parent${id}@example.com`,relationship_title:'Parent',access_enabled:1});
beforeEach(()=>{
 vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:vi.fn(()=> 'blob:synthetic-paper'),revokeObjectURL:vi.fn()}));
 vi.clearAllMocks();saveInsurance.mockResolvedValue(true);saveRoi.mockResolvedValue(true);pendingRoi.mockReturnValue([{schoolStaffUserId:99,nextState:'roi_docs'}]);reloadRoi.mockResolvedValue();
 context={documents:[{id:9,mime_type:'application/pdf',scan_status:'clean'}],client:{id:4,agency_id:2,organization_id:3,full_name:'Synthetic Student',date_of_birth:'2018-01-02',insurance_type_id:7},schoolName:'Example School',guardians:[guardian(20),guardian(21)],state:{completedSteps:[],invitations:{}},packetRead:{id:11,documentId:9,status:'applied',roiSignatureDetected:true,disclosureSignatureDetected:true,versionLabel:'2026-08-20'}};
 api.get.mockImplementation(async(path)=>path.includes('/view')?{data:{text:async()=>JSON.stringify({url:'/synthetic-private-packet.pdf'})},headers:{'content-type':'application/json'}}:{data:path.endsWith('/paper-packet-processing')?structuredClone(context):path==='/client-settings/insurance-types'?[{id:7,label:'Commercial',is_active:1}]:[]});
 api.put.mockImplementation(async(path,{step,data})=>{if(step==='draft'){context.workingDraft={...structuredClone(data),clientId:4,agencyId:2};context.state.workingDraftRevision=Number(context.state.workingDraftRevision||0)+1;return {data:{state:structuredClone(context.state)}};}context.state.completedSteps=[...new Set([...context.state.completedSteps,step])];if(step==='consents'&&data.evidenceReview)context.state.consentReview={...data.evidenceReview,kind:'human_source_review'};if(step==='demographics')context.state.documentId=data.documentId;if(step.startsWith('guardian'))context.state[`${step}Id`]=data.guardianUserId||null;return {data:{state:structuredClone(context.state)}};});
 api.post.mockResolvedValue({data:{state:{completedSteps:steps,processedAt:'2026-11-07T22:00:00Z',invitations:{20:{status:'sent'},21:{status:'failed'}}}}});
});
afterEach(()=>{w?.unmount();vi.useRealTimers();vi.unstubAllGlobals();});
async function render({realRoi=false}={}){w=mount(SchoolPaperPacketWorkflow,{props:{clientId:4},global:{stubs:{
 PDFPreview:{props:['pdfUrl'],emits:['loaded'],mounted(){this.$emit('loaded',{totalPages:6})},template:'<div data-test="packet">{{pdfUrl}}</div>'},
 ClientInsuranceEditor:{template:'<form><input value="Unsaved policy edit" /></form>',methods:{save:saveInsurance}},
 AssignmentCoverageReview:true,ClientOnboardingRoiStaffPanel:realRoi?false:{template:'<div data-test="roi"/>',methods:{saveAllDirty:saveRoi,getPendingChanges:pendingRoi,reload:reloadRoi}}
}}});await flushPromises();}
const next=()=>w.findAll('.paper-actions button').at(-1).trigger('click');
it('keeps the PDF visible beside one step and resumes saved progress with separate guardian accounts',async()=>{
 await render();expect(w.get('[data-test="packet"]').text()).toContain('synthetic-private-packet.pdf');expect(w.findAll('fieldset')).toHaveLength(1);
 await next();await flushPromises();expect(w.get('h4').text()).toContain('Parent 1');await next();await flushPromises();expect(context.state.guardian1Id).toBe(20);
 w.unmount();await render();expect(w.get('h4').text()).toContain('Client demographics');await w.findAll('nav button')[2].trigger('click');await next();await flushPromises();expect(context.state.guardian2Id).toBe(21);expect(api.post).not.toHaveBeenCalled();expect(w.get('[data-test="packet"]').exists()).toBe(true);
});
it('saves insurance corrections before advancing, and stays on the step when that save fails',async()=>{
 context.state={completedSteps:steps.slice(0,4),documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes'};await render();await w.findAll('nav button')[4].trigger('click');
 await w.get('input[type="checkbox"]').setValue(true);saveInsurance.mockResolvedValueOnce(false);await next();await flushPromises();expect(w.get('h4').text()).toContain('Insurance');expect(api.put).not.toHaveBeenCalled();
 await next();await flushPromises();expect(saveInsurance).toHaveBeenCalledTimes(2);expect(api.put).toHaveBeenCalledWith(expect.anything(),{step:'insurance',data:{reviewed:true,insuranceTypeId:7}});expect(w.get('h4').text()).toContain('Paper consents and release');expect(w.findAll('form form')).toHaveLength(0);
});
it('finishes only after saving ROI corrections and displays each recipient outcome',async()=>{
 context.state={completedSteps:steps,documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes'};await render();
 await fillHuman();
 saveRoi.mockResolvedValueOnce(false);await next();await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.get('[role="alert"]').text()).toContain('ROI corrections');
 await next();await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.get('h4').text()).toContain('Review');await next();await flushPromises();expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/4/paper-packet-processing/complete',{signaturesConfirmed:true,staffRoiConfirmed:true});expect(w.text()).toContain('Parent 20: sent');expect(w.text()).toContain('Parent 21: failed');
 await w.findAll('button').find(b=>b.text()==='Retry failed invitations').trigger('click');await flushPromises();expect(saveRoi).toHaveBeenCalledTimes(2);expect(api.post).toHaveBeenCalledTimes(2);
});
it('keeps an unmatched paper packet pending without offering a new signature form',async()=>{
 context.state={completedSteps:steps,documentId:9};context.packetRead.status='needs_review';context.packetRead.versionLabel='';await render();await w.findAll('nav button')[5].trigger('click');expect(w.text()).toContain('Confirm the evidence on this uploaded packet');await next();await flushPromises();expect(api.put).not.toHaveBeenCalled();expect(w.text()).toContain('Printed packet version');expect(w.text()).toContain('no new signatures');expect(w.find('canvas').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});

it('previews encrypted PDF bytes and releases the private blob when closed',async()=>{
 const previous=api.get.getMockImplementation();
 api.get.mockImplementation(async(path,options)=>path.includes('/view')?{data:new Blob(['synthetic PDF'],{type:'application/pdf'}),headers:{'content-type':'application/pdf'}}:previous(path,options));
 await render();expect(w.get('[data-test="packet"]').text()).toBe('blob:synthetic-paper');
 expect(api.get).toHaveBeenCalledWith('/clients/4/paper-packet-processing/documents/9/view',{responseType:'blob',skipGlobalLoading:true});
 expect(api.get).not.toHaveBeenCalledWith('/phi-documents/clients/4');
 w.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-paper');
});

async function fillHuman(){await w.findAll('nav button')[5].trigger('click');await w.findAll('.paper-human-review input').find(i=>i.attributes('placeholder')).setValue('1.02');for(const select of w.findAll('.paper-signature-evidence select'))await select.setValue('present');for(const input of w.findAll('.paper-signature-evidence input'))await input.setValue(input.attributes('type')==='date'?'2026-11-12':input.attributes('type')==='number'?'1':'Synthetic Parent');for(const input of w.findAll('input[type="checkbox"]'))await input.setValue(true);}
it('offers usable, explicit source review when OCR misses signatures, and advances only after the reviewer records them',async()=>{
 context.state={completedSteps:steps,documentId:9};context.packetRead.status='needs_review';context.packetRead.roiSignatureDetected=false;context.packetRead.disclosureSignatureDetected=false;context.packetRead.reviewReasons=['replacement_packet_requires_review','roi_signature_missing'];
 await render();await w.findAll('nav button')[5].trigger('click');expect(w.text()).toContain('Confirm the evidence');await next();await flushPromises();expect(api.put).not.toHaveBeenCalled();await fillHuman();await next();await flushPromises();expect(api.put).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({step:'consents',data:expect.objectContaining({staffChanges:[{schoolStaffUserId:99,nextState:'roi_docs'}],evidenceReview:expect.objectContaining({documentId:9,evaluationId:11,versionLabel:'1.02',sourceViewed:true,denyReviewed:true})})}));expect(w.get('h4').text()).toContain('Review');expect(w.text()).toContain('Synthetic Parent');
});
it('autosaves a working entry and restores it after a literal remount without marking a step complete',async()=>{
 vi.useFakeTimers();await render();await w.findAll('label').find(l=>l.text()==='Preferred language').get('input').setValue('B20-UNSAVED-REMOUNT-PROBE');await vi.advanceTimersByTimeAsync(600);await flushPromises();expect(w.text()).toContain('Entry draft saved. Save insurance policy changes separately before reloading.');expect(context.state.completedSteps).toEqual([]);w.unmount();await render();expect(w.findAll('label').find(l=>l.text()==='Preferred language').get('input').element.value).toBe('B20-UNSAVED-REMOUNT-PROBE');expect(api.post).not.toHaveBeenCalled();vi.useRealTimers();
});
it('keeps a failed autosave visible and does not close or approve the form',async()=>{vi.useFakeTimers();await render();api.put.mockRejectedValueOnce(Error('Unavailable'));await w.findAll('label').find(l=>l.text()==='Preferred language').get('input').setValue('Unsaved');await vi.advanceTimersByTimeAsync(600);await flushPromises();expect(w.text()).toContain('could not save');expect(context.state.completedSteps).toEqual([]);expect(w.emitted('close')).toBeUndefined();vi.useRealTimers();});

it('does not dirty or save a packet merely by inspecting another already available step',async()=>{
 vi.useFakeTimers();context.state.completedSteps=steps;await render();api.put.mockClear();await w.findAll('nav button')[0].trigger('click');await vi.advanceTimersByTimeAsync(800);await flushPromises();expect(api.put).not.toHaveBeenCalled();expect(w.text()).not.toContain('Unsaved changes');expect(w.text()).toContain('Client 000004 · Document #9 · Evaluation #11');
});

it('explains sequential controls and retains earlier source review IDs without inventing a completed negative case',async()=>{
 context.state.previousPackets=[{documentId:7,consentReview:{versionLabel:'1.01'},processedAt:'2026-11-11T10:00:00Z'}];await render();expect(w.findAll('nav button')[3].attributes('disabled')).toBeDefined();expect(w.findAll('nav button')[3].attributes('title')).toContain('Save the preceding step');expect(w.text()).toContain('Document #7 · Version 1.01');expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});

it('does not request a quarantined preview and refreshes a completed check without replacing unsaved entry',async()=>{
 context.documents[0].scan_status='pending';await render();
 expect(api.get.mock.calls.some(([url])=>url.endsWith('/view'))).toBe(false);
 await w.get('input[maxlength="255"]').setValue('Unsaved synthetic name');
 api.post.mockResolvedValueOnce({data:{status:'queued',message:'Queued'}});
 await w.findAll('button').find(b=>b.text()==='Check file and read packet').trigger('click');await flushPromises();
 context.documents[0].scan_status='clean';
 await w.findAll('button').find(b=>b.text()==='Refresh file-check status').trigger('click');await flushPromises();
 expect(w.get('input[maxlength="255"]').element.value).toBe('Unsaved synthetic name');
 expect(w.get('[data-test="packet"]').text()).toContain('synthetic-private-packet.pdf');
 expect(api.post).toHaveBeenCalledTimes(1);
});

it('shows the missing required field without silently swallowing Save and continue',async()=>{
 context.client.date_of_birth=null;await render();await next();await flushPromises();
 expect(w.get('[role="alert"]').text()).toContain('Date of birth');
 expect(w.get('[role="alert"]').text()).toContain('leave this step pending');
 expect(api.put).not.toHaveBeenCalled();expect(w.get('h4').text()).toContain('Client demographics');
 const date=w.get('input[type="date"]');await date.setValue('2016-03-12');await next();await flushPromises();
 expect(api.put).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({step:'demographics',data:expect.objectContaining({dateOfBirth:'2016-03-12'})}));
 expect(w.get('h4').text()).toContain('Parent 1');
});
it('hydrates a date-only field from a serialized database DATE without timezone conversion',async()=>{
 context.client.date_of_birth='2016-03-12T00:00:00.000Z';await render();expect(w.get('input[type="date"]').element.value).toBe('2016-03-12');
});
it('does not restore an old autosave response after another child opens',async()=>{vi.useFakeTimers();await render();let finish;api.put.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));await w.findAll('label').find(l=>l.text()==='Preferred language').get('input').setValue('Old child probe');await vi.advanceTimersByTimeAsync(600);await flushPromises();context.client={...context.client,id:5,full_name:'Other Synthetic'};context.documents=[{id:10,mime_type:'application/pdf',scan_status:'clean'}];context.packetRead={...context.packetRead,id:12,documentId:10};context.state={completedSteps:[],workingDraftRevision:0};await w.setProps({clientId:5});await flushPromises();finish({data:{state:{workingDraftRevision:999}}});await flushPromises();expect(w.findAll('label').find(l=>l.text()==='Preferred language').get('input').element.value).not.toBe('Old child probe');expect(w.vm.state.workingDraftRevision).toBe(0);vi.useRealTimers();});

it('keeps real staff changes pending until the reviewed consents request succeeds, without direct ROI or expiry writes',async()=>{
 context.state={completedSteps:steps,documentId:9};context.packetRead.status='needs_review';context.packetRead.roiSignatureDetected=false;
 let committed=false;const originalGet=api.get.getMockImplementation(),originalPut=api.put.getMockImplementation();
 api.get.mockImplementation(async(path,...args)=>path.endsWith('/school-roi-access')?{data:{staff:[{school_staff_user_id:99,first_name:'QA',last_name:'Counselor',access_level:committed?'roi_docs':'packet',effective_access_state:committed?'roi_docs':'packet'}],roi_expires_at:null,paper_packet_vision:{status:'needs_review'}}}:originalGet(path,...args));
 await render({realRoi:true});await w.findAll('nav button')[5].trigger('click');const roi=w.findComponent({name:'ClientOnboardingRoiStaffPanel'});expect(roi.props('deferChanges')).toBe(true);
 expect(roi.findComponent({name:'ClientOnboardingRoiExpiryEditor'}).exists()).toBe(false);expect(roi.text()).not.toContain('Save changes');expect(roi.text()).not.toContain('Mark complete');
 await roi.get('select').setValue('roi_docs');await next();await flushPromises();expect(api.put.mock.calls.some(([path])=>path.includes('/school-roi-access/'))).toBe(false);expect(api.put.mock.calls.some(([,body])=>body.step==='consents')).toBe(false);
 await fillHuman();api.put.mockImplementationOnce(async()=>{throw{response:{status:409,data:{error:{message:'Source review changed.'}}}}});await next();await flushPromises();expect(w.text()).toContain('Source review changed.');expect(roi.get('select').element.value).toBe('roi_docs');
 expect(api.put.mock.calls.some(([path])=>path.includes('/school-roi-access/'))).toBe(false);
 api.put.mockImplementation(async(path,body)=>{if(body.step==='consents')committed=true;return originalPut(path,body);});await next();await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/clients/4/paper-packet-processing',expect.objectContaining({step:'consents',data:expect.objectContaining({staffChanges:[{schoolStaffUserId:99,nextState:'roi_docs'}],evidenceReview:expect.objectContaining({documentId:9,evaluationId:11})})}));
 expect(api.get.mock.calls.filter(([path])=>path.endsWith('/school-roi-access'))).toHaveLength(2);expect(api.put.mock.calls.every(([path])=>path==='/clients/4/paper-packet-processing')).toBe(true);expect(api.post).not.toHaveBeenCalled();expect(w.get('h4').text()).toContain('Review');
});
it('allows prepared primary-parent corrections and advances without activating the account',async()=>{context.guardians[0]={...guardian(20),access_enabled:0,permissions_json:{pendingGuardianVerification:true,accountPreparationSource:'saved_guardian_contact'}};api.patch.mockResolvedValue({data:{ok:true}});await render();await next();await flushPromises();expect(w.text()).toContain('Portal account prepared');const phone=w.find('input[type="tel"]');expect(phone.attributes('readonly')).toBeUndefined();await phone.setValue('719-555-0123');await next();await flushPromises();expect(api.patch).toHaveBeenCalledWith('/clients/4/guardians/20',expect.objectContaining({contact:expect.objectContaining({phone:'719-555-0123'})}),{skipGlobalLoading:true});expect(api.patch.mock.calls[0][1]).not.toHaveProperty('accessEnabled');expect(w.get('h4').text()).toContain('Other parent and contacts');});
it('defaults a listed other parent to contact only and adds contacts inside the wizard without a nested form',async()=>{context.guardians=[guardian(20)];context.state={completedSteps:['demographics','guardian1'],documentId:9,guardian1Id:20};const baseGet=api.get.getMockImplementation();api.get.mockImplementation(async(path,...args)=>path==='/clients/4/contacts'?{data:{items:[]}}:baseGet(path,...args));await render();await w.findAll('nav button')[2].trigger('click');await flushPromises();expect(w.text()).toContain('Contact only — no portal account');await w.findAll('button').find(button=>button.text()==='Add contact').trigger('click');expect(w.find('form form').exists()).toBe(false);expect(w.findAll('input[type="email"]')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();});
